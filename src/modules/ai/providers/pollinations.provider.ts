import { IAiProvider, ProviderChatOptions } from './provider.interface';
import { env } from '../../../config/env';
import { logger } from '../../../config/logger';
import https from 'https';
import http from 'http';
import { postRequest } from './httpClient';

const DOWNLOAD_TIMEOUT_MS = 5_000;

function downloadFileToBuffer(url: string, attempt = 1): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const parsed = new URL(url);
    const req = client.get({
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return downloadFileToBuffer(res.headers.location, attempt).then(resolve).catch(reject);
      }
      if (res.statusCode && res.statusCode >= 400) {
        res.resume();
        return reject(new Error(`Pollinations HTTP status code ${res.statusCode}`));
      }
      const chunks: Buffer[] = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    });

    req.setTimeout(DOWNLOAD_TIMEOUT_MS, () => {
      req.destroy();
      if (attempt < 2) {
        downloadFileToBuffer(url, attempt + 1).then(resolve).catch(reject);
      } else {
        reject(new Error('Pollinations request timed out'));
      }
    });

    req.on('error', reject);
  });
}

export class PollinationsProvider implements IAiProvider {
  name = 'pollinations';

  async generateResponse(prompt: string, options?: ProviderChatOptions): Promise<string> {
    logger.info('Sending prompt to Pollinations AI text endpoint...');

    const messages: { role: string; content: string }[] = [];
    if (options?.history && options.history.length > 0) {
      options.history.forEach((h) => {
        messages.push({
          role: h.role === 'model' ? 'assistant' : h.role,
          content: h.content,
        });
      });
    }
    messages.push({ role: 'user', content: prompt });

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      };
      const reqBody: any = {
        messages,
      };

      if (env.POLLINATIONS_API_KEY) {
        headers['Authorization'] = `Bearer ${env.POLLINATIONS_API_KEY}`;
        reqBody.model = 'openai';
      }

      const res = await postRequest('https://text.pollinations.ai/', headers, reqBody, 5000);

      if (res.statusCode && res.statusCode < 400 && res.body) {
        return res.body;
      }
      logger.warn(`Pollinations POST returned status ${res.statusCode}. Trying GET fallback...`);
    } catch (err: any) {
      logger.warn(`Pollinations POST request failed (${err.message}). Trying GET fallback...`);
    }

    // Fallback 1: GET request to free public Pollinations text endpoint
    try {
      const getUrl = `https://text.pollinations.ai/${encodeURIComponent(prompt)}`;
      logger.info(`Fetching Pollinations text via GET fallback: ${getUrl}`);
      const buffer = await downloadFileToBuffer(getUrl);
      const text = buffer.toString('utf-8');
      if (text) {
        return text;
      }
    } catch (getErr: any) {
      logger.warn(`Pollinations AI GET fallback failed: ${getErr.message}. Trying Gemini fallback...`);
    }

    // Fallback 2: Gemini text generation if Pollinations is completely blocked
    try {
      const { GeminiProvider } = require('./gemini.provider');
      const gemini = new GeminiProvider();
      return await gemini.generateResponse(prompt, options);
    } catch (gErr: any) {
      logger.error(`Gemini fallback for Pollinations failed: ${gErr.message}`);
    }

    throw new Error('Pollinations AI text generation service unavailable');
  }

  async generateTitle(firstMessage: string): Promise<string> {
    return 'Pollinations AI Chat';
  }

  async *streamResponse(prompt: string, options?: ProviderChatOptions): AsyncIterable<string> {
    const text = await this.generateResponse(prompt, options);
    yield text;
  }

  async generateImage(prompt: string): Promise<Buffer> {
    logger.info(`Generating image via Pollinations AI for prompt: "${prompt}"...`);
    const enhancedPrompt = `${prompt.trim()}, 8k resolution, highly detailed, photorealistic, cinematic lighting, masterpiece`;
    const encodedPrompt = encodeURIComponent(enhancedPrompt);

    let url = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=1024&height=1024&nologo=true&private=true`;
    if (env.POLLINATIONS_API_KEY) {
      url += `&key=${encodeURIComponent(env.POLLINATIONS_API_KEY)}`;
    }

    return await downloadFileToBuffer(url);
  }
}
