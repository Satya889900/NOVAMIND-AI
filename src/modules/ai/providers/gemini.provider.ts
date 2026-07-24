import { GoogleGenerativeAI } from '@google/generative-ai';
import { aiClient, MODEL_FALLBACK_ORDER } from '../../../config/gemini';
import { logger } from '../../../config/logger';
import { env } from '../../../config/env';
import { IAiProvider, ProviderChatOptions } from './provider.interface';
import { attemptCloudflareImageGen } from './flux.provider';
import { cleanImagePrompt } from '../../../utils/cleanPrompt';
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
      instances: [
        { prompt }
      ],
      parameters: {
        sampleCount: 1,
        aspectRatio: '1:1',
        outputMimeType: 'image/png'
      }
    });

    const options = {
      hostname: 'generativelanguage.googleapis.com',
      path: '/v1beta/models/imagen-3.0-generate-002:predict',
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
          const base64Bytes = parsed?.predictions?.[0]?.bytesBase64Encoded;
          
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

function generateImageViaHuggingFace(prompt: string, apiKey: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      inputs: prompt,
    });

    const options = {
      hostname: 'router.huggingface.co',
      path: '/hf-inference/v1/models/black-forest-labs/FLUX.1-schnell',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      timeout: 30000,
    };

    const req = https.request(options, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const buffer = Buffer.concat(chunks);
        if (res.statusCode && res.statusCode >= 400) {
          const body = buffer.toString('utf-8');
          return reject(new Error(`HTTP ${res.statusCode}: ${body}`));
        }
        resolve(buffer);
      });
      res.on('error', reject);
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Hugging Face API request timed out'));
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

function getModelsToTry(requestedModel?: string): string[] {
  const models = [...MODEL_FALLBACK_ORDER];
  if (requestedModel) {
    let mapped = 'gemini-2.0-flash-lite';
    if (requestedModel.includes('flash') && !requestedModel.includes('lite')) {
      mapped = 'gemini-2.0-flash';
    }
    if (!models.includes(mapped)) {
      models.unshift(mapped);
    } else {
      const idx = models.indexOf(mapped);
      models.splice(idx, 1);
      models.unshift(mapped);
    }
  }
  return models;
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

    // Build prompt parts (with image or audio attachment if present)
    const promptParts: any[] = [];
    if (options?.imageAttachment) {
      promptParts.push({
        inlineData: {
          mimeType: options.imageAttachment.mimeType,
          data: options.imageAttachment.data,
        },
      });
    }
    if (options?.audioAttachment) {
      promptParts.push({
        inlineData: {
          mimeType: options.audioAttachment.mimeType,
          data: options.audioAttachment.data,
        },
      });
    }
    promptParts.push({ text: prompt });

    const finalPrompt = promptParts.length > 1 ? promptParts : prompt;

    const errors: string[] = [];
    const modelsToTry = getModelsToTry(options?.model);

    // Fallback logic
    for (const modelName of modelsToTry) {
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

    // High-speed fallback to Groq if Gemini is rate limited or unavailable
    if (env.GROQ_API_KEY && !env.GROQ_API_KEY.includes('mock') && !env.GROQ_API_KEY.includes('your_groq')) {
      try {
        logger.info('Gemini models rate-limited or unavailable. Automatically falling back to Groq (Llama 3.3)...');
        const { GroqProvider } = require('./groq.provider');
        const groq = new GroqProvider();
        return await groq.generateResponse(prompt, options);
      } catch (groqErr: any) {
        logger.warn(`Groq fallback failed: ${groqErr.message}`);
      }
    }

    throw new Error(`All Gemini models failed:\n${errors.join('\n')}`);
  }

  async *streamResponse(prompt: string, options?: ProviderChatOptions): AsyncIterable<string> {
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

    // Build prompt parts (with image or audio attachment if present)
    const promptParts: any[] = [];
    if (options?.imageAttachment) {
      promptParts.push({
        inlineData: {
          mimeType: options.imageAttachment.mimeType,
          data: options.imageAttachment.data,
        },
      });
    }
    if (options?.audioAttachment) {
      promptParts.push({
        inlineData: {
          mimeType: options.audioAttachment.mimeType,
          data: options.audioAttachment.data,
        },
      });
    }
    promptParts.push({ text: prompt });

    const finalPrompt = promptParts.length > 1 ? promptParts : prompt;

    const modelsToTry = getModelsToTry(options?.model);

    // Fallback logic for streaming
    for (const modelName of modelsToTry) {
      try {
        const model = (aiClient as GoogleGenerativeAI).getGenerativeModel({ model: modelName });

        if (history.length > 0) {
          const chat = model.startChat({
            history,
            generationConfig: { maxOutputTokens, temperature },
          });
          const resultStream = await chat.sendMessageStream(finalPrompt);
          for await (const chunk of resultStream.stream) {
            const chunkText = chunk.text();
            if (chunkText) {
              yield chunkText;
            }
          }
        } else {
          const resultStream = await model.generateContentStream(finalPrompt);
          for await (const chunk of resultStream.stream) {
            const chunkText = chunk.text();
            if (chunkText) {
              yield chunkText;
            }
          }
        }
        return; // Success, exit generator
      } catch (err: any) {
        logger.warn(`Gemini Model ${modelName} stream failed: ${err.message || err}`);
        if (modelName === modelsToTry[modelsToTry.length - 1]) {
          // If Gemini models fail, attempt high-speed Groq streaming fallback
          if (env.GROQ_API_KEY && !env.GROQ_API_KEY.includes('mock') && !env.GROQ_API_KEY.includes('your_groq')) {
            try {
              logger.info('All Gemini stream models rate-limited or unavailable. Automatically falling back to Groq Llama 3.3...');
              const { GroqProvider } = require('./groq.provider');
              const groq = new GroqProvider();
              if (groq.streamResponse) {
                for await (const chunk of groq.streamResponse(prompt, options)) {
                  yield chunk;
                }
                return;
              }
            } catch (groqErr: any) {
              logger.warn(`Groq stream fallback failed: ${groqErr.message}`);
            }
          }
          throw err;
        }
      }
    }
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
    const cleanPrompt = cleanImagePrompt(prompt);
    const enhancedPrompt = `${cleanPrompt}, 8k resolution, highly detailed, cinematic lighting, photorealistic, clean composition, professional digital art, masterpiece`;
    const encodedPrompt = encodeURIComponent(enhancedPrompt);
    const seed = Math.floor(Math.random() * 10000000);
    const pollinationsUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=1024&height=1024&nologo=true&seed=${seed}&model=flux`;

    const now = Date.now();
    const inCooldown = imagenQuotaResetAt > now;

    // 1. Try Gemini Imagen FIRST if not in cooldown
    if (!inCooldown) {
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
            `(until ${new Date(imagenQuotaResetAt).toISOString()}).`
          );
        } else {
          logger.warn(`Gemini Imagen failed (${errMsg}).`);
        }
      }
    } else {
      const remainingSecs = Math.ceil((imagenQuotaResetAt - now) / 1000);
      logger.info(`Gemini Imagen is in quota cooldown for ${remainingSecs}s more. Checking Cloudflare Workers AI fallback...`);
    }

    // 2. Fallback to Cloudflare Workers AI FLUX if Gemini Imagen is unavailable/failed
    const cfToken = env.CLOUDFLARE_API_TOKEN;
    const isCfConfigured = cfToken && !cfToken.includes('your_cloudflare') && !cfToken.includes('mock');

    if (isCfConfigured) {
      try {
        logger.info(`Attempting fallback image generation via Cloudflare Workers AI FLUX...`);
        return await attemptCloudflareImageGen(enhancedPrompt);
      } catch (cfErr: any) {
        logger.warn(`Cloudflare Workers AI FLUX fallback failed (${cfErr.message}). Checking HuggingFace...`);
      }
    }

    // 3. Fallback to HuggingFace FLUX.1-schnell
    const hfApiKey = env.HUGGINGFACE_API_KEY || env.BFL_API_KEY;
    const isHfPlaceholder = !hfApiKey || hfApiKey.includes('your_huggingface') || hfApiKey.includes('your_bfl') || hfApiKey.includes('hf_mock');
    if (!isHfPlaceholder) {
      try {
        logger.info(`Attempting fallback image generation via HuggingFace FLUX.1-schnell...`);
        return await generateImageViaHuggingFace(enhancedPrompt, hfApiKey!);
      } catch (hfErr: any) {
        logger.warn(`HuggingFace FLUX fallback failed (${hfErr.message}). Falling back to Pollinations.ai...`);
      }
    } else {
      logger.info(`HuggingFace API Key is not configured. Falling back directly to Pollinations.ai...`);
    }

    // 4. Ultimate Fallback to Pollinations.ai
    logger.info(`Falling back directly to Pollinations.ai image generation...`);
    return await downloadFileToBuffer(pollinationsUrl);
  }
}
