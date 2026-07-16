import { GoogleGenerativeAI } from '@google/generative-ai';
import { aiClient, MODEL_FALLBACK_ORDER } from '../../../config/gemini';
import { logger } from '../../../config/logger';
import { env } from '../../../config/env';
import { IAiProvider, ProviderChatOptions } from './provider.interface';
import https from 'https';
import http from 'http';

/**
 * Module-level cooldown tracker for Gemini Imagen 429 rate limits.
 * Stores the epoch ms timestamp after which it is safe to retry Gemini Imagen.
 * When 0 the service is considered available.
 */
let imagenQuotaResetAt: number = 0;

/**
 * Parse the `retryDelay` seconds from a Gemini 429 error body string.
 * Returns 0 if it cannot be parsed.
 */
function parseRetryDelaySecs(errorBody: string): number {
  try {
    const parsed = JSON.parse(errorBody.slice(errorBody.indexOf('{')));
    const retryDelay: string | undefined =
      parsed?.error?.details?.find((d: any) => d['@type']?.includes('RetryInfo'))?.retryDelay;
    if (retryDelay) {
      // retryDelay is e.g. "39s" or "39.515328812s"
      const seconds = parseFloat(retryDelay.replace('s', ''));
      if (!isNaN(seconds) && seconds > 0) return seconds;
    }
  } catch {
    // ignore parse errors
  }
  return 60; // sensible default fallback: 60 seconds
}

const DOWNLOAD_TIMEOUT_MS = 90_000; // 90 seconds — AI image generation can take 30–60s+

/** Socket error codes that are safe to retry (server dropped connection, etc.) */
const RETRIABLE_SOCKET_ERRORS = new Set(['ECONNRESET', 'ECONNREFUSED', 'EPIPE', 'ETIMEDOUT', 'EHOSTUNREACH']);

function downloadFileToBuffer(url: string, attempt = 1): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const req = client.get(url, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return downloadFileToBuffer(res.headers.location, attempt).then(resolve).catch(reject);
      }
      if (res.statusCode && res.statusCode >= 400) {
        res.resume();
        return reject(new Error(`HTTP status code ${res.statusCode}`));
      }
      const chunks: Buffer[] = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    });

    req.setTimeout(DOWNLOAD_TIMEOUT_MS, () => {
      req.destroy();
      if (attempt < 2) {
        logger.warn(`Image download timed out (attempt ${attempt}). Retrying...`);
        downloadFileToBuffer(url, attempt + 1).then(resolve).catch(reject);
      } else {
        reject(new Error(`Image download timed out after ${DOWNLOAD_TIMEOUT_MS / 1000}s (2 attempts)`));
      }
    });

    req.on('error', (err: NodeJS.ErrnoException) => {
      if (attempt < 2 && (RETRIABLE_SOCKET_ERRORS.has(err.code ?? '') || err.message.includes('socket hang up'))) {
        logger.warn(`Image download socket error '${err.code ?? err.message}' (attempt ${attempt}). Retrying...`);
        downloadFileToBuffer(url, attempt + 1).then(resolve).catch(reject);
      } else {
        reject(err);
      }
    });
  });
}

function generateImageViaGemini(prompt: string, apiKey: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      contents: [
        {
          parts: [
            {
              text: prompt,
            },
          ],
        },
      ],
      generationConfig: {
        responseModalities: ['IMAGE'],
      },
    });

    const options = {
      hostname: 'generativelanguage.googleapis.com',
      path: '/v1beta/models/gemini-3.1-flash-image:generateContent',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
    };

    const req = https.request(options, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf-8');
        if (res.statusCode && res.statusCode >= 400) {
          return reject(new Error(`HTTP ${res.statusCode}: ${body}`));
        }
        try {
          const parsed = JSON.parse(body);
          const parts = parsed?.candidates?.[0]?.content?.parts;
          const imagePart = parts?.find((p: any) => p.inlineData);
          const base64Bytes = imagePart?.inlineData?.data;
          
          if (!base64Bytes) {
            return reject(new Error(`No image bytes in response: ${body}`));
          }
          resolve(Buffer.from(base64Bytes, 'base64'));
        } catch (e: any) {
          reject(e);
        }
      });
      res.on('error', reject);
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

export class GeminiProvider implements IAiProvider {
  name = 'gemini';

  async generateResponse(prompt: string, options?: ProviderChatOptions): Promise<string> {
    if (!aiClient) {
      throw new Error('Gemini AI client is not initialized. Check GEMINI_API_KEY in .env');
    }

    const temperature = options?.temperature !== undefined ? options.temperature : 0.8;
    const maxOutputTokens = options?.maxTokens !== undefined ? options.maxTokens : 2048;

    // Build history
    const history: { role: string; parts: { text: string }[] }[] = [];
    if (options?.history && options.history.length > 0) {
      const mappedHistory = options.history.map((msg) => ({
        role: msg.role === 'user' ? 'user' : 'model',
        parts: [{ text: msg.content }],
      }));

      // Alternating user/model role logic
      for (const entry of mappedHistory) {
        if (history.length === 0 || history[history.length - 1].role !== entry.role) {
          history.push({ ...entry });
        } else {
          history[history.length - 1].parts[0].text += '\n' + entry.parts[0].text;
        }
      }
    }

    // Build prompt parts (with image attachment if present)
    const promptParts: any[] = [];
    if (options?.imageAttachment) {
      promptParts.push({
        inlineData: {
          mimeType: options.imageAttachment.mimeType,
          data: options.imageAttachment.data,
        },
      });
    }
    promptParts.push({ text: prompt });

    const finalPrompt = promptParts.length > 1 ? promptParts : prompt;
    const errors: string[] = [];

    // Fallback logic
    for (const modelName of MODEL_FALLBACK_ORDER) {
      try {
        const model = (aiClient as GoogleGenerativeAI).getGenerativeModel({ model: modelName });
        let text: string;

        if (history.length > 0) {
          const chat = model.startChat({
            history,
            generationConfig: { maxOutputTokens, temperature },
          });
          const result = await chat.sendMessage(finalPrompt);
          text = result.response.text();
        } else {
          const result = await model.generateContent(finalPrompt);
          text = result.response.text();
        }

        if (text && text.trim()) {
          if (modelName !== MODEL_FALLBACK_ORDER[0]) {
            logger.info(`AI responded using fallback Gemini model: ${modelName}`);
          }
          return text;
        }
      } catch (err: any) {
        const msg = err.message || String(err);
        errors.push(`[${modelName}]: ${msg}`);
        logger.warn(`Gemini Model ${modelName} failed: ${msg}`);

        const isRetriable =
          msg.includes('503') ||
          msg.includes('429') ||
          msg.includes('404') ||
          msg.includes('not found') ||
          msg.includes('high demand') ||
          msg.includes('quota') ||
          msg.includes('fetch failed') ||   // transient network blip
          msg.includes('ECONNRESET') ||     // connection reset
          msg.includes('ETIMEDOUT') ||      // request timed out
          msg.includes('ENOTFOUND');        // DNS failure
        if (!isRetriable) break;
      }
    }

    throw new Error(`All Gemini models failed:\n${errors.join('\n')}`);
  }

  async generateTitle(firstMessage: string): Promise<string> {
    const prompt = `Generate a very short chat title (3-5 words max) summarizing this message. No quotes, no punctuation at end.\n\nMessage: "${firstMessage}"\n\nTitle:`;
    try {
      const title = await this.generateResponse(prompt);
      return title.trim().replace(/^["'](.*)["']$/, '$1') || firstMessage.substring(0, 25);
    } catch (err: any) {
      logger.error(`Gemini title generation failed: ${err.message}`);
      return firstMessage.substring(0, 25);
    }
  }

  async generateImage(prompt: string): Promise<Buffer> {
    const enhancedPrompt = `${prompt.trim()}, 8k resolution, highly detailed, cinematic lighting, photorealistic, clean composition, professional digital art, masterpiece`;
    const encodedPrompt = encodeURIComponent(enhancedPrompt);
    const pollinationsUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=1024&height=1024&nologo=true&private=true&model=flux&enhance=true`;

    const now = Date.now();
    const inCooldown = imagenQuotaResetAt > now;

    if (inCooldown) {
      const remainingSecs = Math.ceil((imagenQuotaResetAt - now) / 1000);
      logger.info(`Gemini Imagen is in quota cooldown for ${remainingSecs}s more. Using Pollinations.ai directly.`);
      return await downloadFileToBuffer(pollinationsUrl);
    }

    try {
      if (!env.GEMINI_API_KEY) {
        throw new Error('GEMINI_API_KEY is not configured');
      }
      logger.info(`Attempting image generation via Gemini Imagen...`);
      return await generateImageViaGemini(enhancedPrompt, env.GEMINI_API_KEY);
    } catch (err: any) {
      const errMsg: string = err.message || String(err);

      // If rate-limited, parse the retry delay and cache the cooldown window
      if (errMsg.includes('429') || errMsg.toLowerCase().includes('quota')) {
        const delaySecs = parseRetryDelaySecs(errMsg);
        imagenQuotaResetAt = Date.now() + delaySecs * 1000;
        logger.warn(
          `Gemini Imagen quota exceeded. Cooldown set for ${delaySecs.toFixed(0)}s ` +
          `(until ${new Date(imagenQuotaResetAt).toISOString()}). Falling back to Pollinations.ai...`
        );
      } else {
        logger.warn(`Gemini Imagen failed (${errMsg}). Falling back to Pollinations.ai...`);
      }

      return await downloadFileToBuffer(pollinationsUrl);
    }
  }
}
