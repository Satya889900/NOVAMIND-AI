import { IAiProvider, ProviderChatOptions } from './provider.interface';
import { postRequest } from './httpClient';
import { env } from '../../../config/env';
import { logger } from '../../../config/logger';
import https from 'https';

/**
 * Cloudflare Workers AI Provider
 * Uses the Cloudflare OpenAI-compatible chat completions REST API.
 * Endpoint: https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/ai/v1/chat/completions
 * Auth:     Authorization: Bearer {CLOUDFLARE_API_TOKEN}
 * Docs:     https://developers.cloudflare.com/workers-ai/get-started/rest-api/
 */
export class CloudflareProvider implements IAiProvider {
  name = 'cloudflare';

  async generateResponse(prompt: string, options?: ProviderChatOptions): Promise<string> {
    const apiToken = env.CLOUDFLARE_API_TOKEN;
    const accountId = env.CLOUDFLARE_ACCOUNT_ID;

    const isMockKey =
      !apiToken || apiToken.includes('your_cloudflare') || apiToken.includes('mock') ||
      !accountId || accountId.includes('your_cloudflare') || accountId.includes('mock');

    if (isMockKey) {
      logger.warn('Cloudflare Workers AI API Token or Account ID is not configured. Using mock fallback.');
      return `[MOCK RESPONSE] This is a simulated response from NovaMind AI via the Cloudflare Workers AI Provider (Model: ${options?.model || '@cf/meta/llama-3.3-70b-instruct-fp8-fast'}). To activate real answers, configure valid CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID in your backend .env file. Received prompt: "${prompt}"`;
    }

    const temperature = options?.temperature !== undefined ? options.temperature : 0.7;
    const maxOutputTokens = options?.maxTokens !== undefined ? options.maxTokens : 2048;

    // Strip cloudflare/ routing prefix if present
    let modelId = options?.model || '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
    if (modelId.startsWith('cloudflare/')) {
      modelId = modelId.replace('cloudflare/', '');
    }

    // Build messages
    const messages: { role: string; content: string }[] = [];

    if (options?.history && options.history.length > 0) {
      options.history.forEach((msg) => {
        messages.push({
          role: msg.role === 'user' ? 'user' : msg.role === 'system' ? 'system' : 'assistant',
          content: msg.content,
        });
      });
    }

    let finalPrompt = prompt;
    if (options?.imageAttachment) {
      finalPrompt = `[User uploaded an image attachment (${options.imageAttachment.mimeType})] ${prompt}`;
    }

    messages.push({ role: 'user', content: finalPrompt });

    try {
      logger.info(`Sending request to Cloudflare Workers AI using model ${modelId}...`);
      const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/v1/chat/completions`;

      const response = await postRequest(
        url,
        {
          'Authorization': `Bearer ${apiToken}`,
          'Content-Type': 'application/json',
        },
        {
          model: modelId,
          messages,
          temperature,
          max_tokens: maxOutputTokens,
        },
        90000
      );

      if (response.statusCode && response.statusCode >= 400) {
        throw new Error(`HTTP ${response.statusCode}: ${response.body}`);
      }

      const data = JSON.parse(response.body);
      const content = data?.choices?.[0]?.message?.content;

      if (!content) {
        throw new Error(`Invalid response format from Cloudflare Workers AI: ${response.body}`);
      }

      return content;
    } catch (err: any) {
      logger.error(`Cloudflare Workers AI completion request failed: ${err.message}`);
      throw err;
    }
  }

  async *streamResponse(prompt: string, options?: ProviderChatOptions): AsyncIterable<string> {
    const apiToken = env.CLOUDFLARE_API_TOKEN;
    const accountId = env.CLOUDFLARE_ACCOUNT_ID;

    const isMockKey =
      !apiToken || apiToken.includes('your_cloudflare') || apiToken.includes('mock') ||
      !accountId || accountId.includes('your_cloudflare') || accountId.includes('mock');

    if (isMockKey) {
      yield `[MOCK RESPONSE] This is a simulated streaming response from NovaMind AI via the Cloudflare Workers AI Provider (Model: ${options?.model || '@cf/meta/llama-3.3-70b-instruct-fp8-fast'}). To activate real answers, configure CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID. Received prompt: "${prompt}"`;
      return;
    }

    const temperature = options?.temperature !== undefined ? options.temperature : 0.7;
    const maxOutputTokens = options?.maxTokens !== undefined ? options.maxTokens : 2048;

    let modelId = options?.model || '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
    if (modelId.startsWith('cloudflare/')) {
      modelId = modelId.replace('cloudflare/', '');
    }

    const messages: { role: string; content: string }[] = [];
    if (options?.history && options.history.length > 0) {
      options.history.forEach((msg) => {
        messages.push({
          role: msg.role === 'user' ? 'user' : msg.role === 'system' ? 'system' : 'assistant',
          content: msg.content,
        });
      });
    }

    let finalPrompt = prompt;
    if (options?.imageAttachment) {
      finalPrompt = `[User uploaded an image attachment (${options.imageAttachment.mimeType})] ${prompt}`;
    }
    messages.push({ role: 'user', content: finalPrompt });

    const postData = JSON.stringify({
      model: modelId,
      messages,
      temperature,
      max_tokens: maxOutputTokens,
      stream: true,
    });

    const queue: string[] = [];
    let isDone = false;
    let errorToThrow: Error | null = null;
    let resolveNext: (() => void) | null = null;

    const req = https.request({
      hostname: 'api.cloudflare.com',
      path: `/client/v4/accounts/${accountId}/ai/v1/chat/completions`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiToken}`,
      },
    }, (res) => {
      if (res.statusCode && res.statusCode >= 400) {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          errorToThrow = new Error(`Cloudflare Workers AI returned HTTP ${res.statusCode}: ${body}`);
          isDone = true;
          if (resolveNext) resolveNext();
        });
        return;
      }

      let buffer = '';
      res.on('data', (chunk: Buffer) => {
        buffer += chunk.toString('utf-8');
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          if (trimmed === 'data: [DONE]') {
            isDone = true;
            if (resolveNext) resolveNext();
            continue;
          }

          if (trimmed.startsWith('data: ')) {
            try {
              const dataStr = trimmed.slice(6);
              const parsed = JSON.parse(dataStr);
              const content = parsed?.choices?.[0]?.delta?.content || parsed?.response;
              if (content) {
                queue.push(content);
                if (resolveNext) {
                  resolveNext();
                  resolveNext = null;
                }
              }
            } catch (e) {
              // Ignore parse errors on half-received lines
            }
          }
        }
      });

      res.on('end', () => {
        isDone = true;
        if (resolveNext) resolveNext();
      });

      res.on('error', (err) => {
        errorToThrow = err;
        isDone = true;
        if (resolveNext) resolveNext();
      });
    });

    req.on('error', (err) => {
      errorToThrow = err;
      isDone = true;
      if (resolveNext) resolveNext();
    });

    req.write(postData);
    req.end();

    while (true) {
      if (queue.length > 0) {
        yield queue.shift()!;
      } else if (isDone) {
        if (errorToThrow) throw errorToThrow;
        break;
      } else {
        await new Promise<void>((resolve) => {
          resolveNext = resolve;
        });
      }
    }
  }

  async generateTitle(firstMessage: string): Promise<string> {
    const prompt = `Generate a very short chat title (3-5 words max) summarizing this message. No quotes, no punctuation at end.\n\nMessage: "${firstMessage}"\n\nTitle:`;
    try {
      const title = await this.generateResponse(prompt, { temperature: 0.2 });
      return title.trim().replace(/^["'](.*)["']$/, '$1') || firstMessage.substring(0, 25);
    } catch (err: any) {
      logger.error(`Cloudflare title generation failed: ${err.message}`);
      return firstMessage.substring(0, 25);
    }
  }

  async generateImage(prompt: string): Promise<Buffer> {
    throw new Error('Cloudflare Workers AI image generation is not supported via this provider.');
  }
}
