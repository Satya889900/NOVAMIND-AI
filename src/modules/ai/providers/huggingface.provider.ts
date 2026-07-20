import { IAiProvider, ProviderChatOptions } from './provider.interface';
import { postRequest } from './httpClient';
import { env } from '../../../config/env';
import { logger } from '../../../config/logger';
import https from 'https';
import http from 'http';

function downloadFileToBuffer(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    client.get(url, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return downloadFileToBuffer(res.headers.location).then(resolve).catch(reject);
      }
      if (res.statusCode && res.statusCode >= 400) {
        return reject(new Error(`HTTP status code ${res.statusCode}`));
      }
      const chunks: Buffer[] = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

function generateImageViaHuggingFace(prompt: string, apiKey: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      inputs: prompt,
    });

    const options = {
      hostname: 'api-inference.huggingface.co',
      path: '/models/black-forest-labs/FLUX.1-schnell',
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

export class HuggingFaceProvider implements IAiProvider {
  name = 'huggingface';

  async generateResponse(prompt: string, options?: ProviderChatOptions): Promise<string> {
    const apiKey = env.HUGGINGFACE_API_KEY;
    const isMockKey = !apiKey || apiKey.includes('your_huggingface') || apiKey.includes('hf_mock');

    if (isMockKey) {
      logger.warn('Hugging Face API Key is not configured or is a placeholder. Using mock fallback.');
      return `[MOCK RESPONSE] This is a simulated response from NovaMind AI via the Hugging Face Provider (Model: ${options?.model || 'Qwen/Qwen2.5-7B-Instruct'}). To activate real answers from Hugging Face, please configure a valid HUGGINGFACE_API_KEY in your backend .env file. Received prompt: "${prompt}"`;
    }

    const temperature = options?.temperature !== undefined ? options.temperature : 0.7;
    const maxOutputTokens = options?.maxTokens !== undefined ? options.maxTokens : 2048;
    
    // Map model names
    let modelId = options?.model || 'Qwen/Qwen2.5-7B-Instruct';

    // Build chat history messages
    const messages: { role: string; content: string }[] = [];
    
    if (options?.history && options.history.length > 0) {
      options.history.forEach((msg) => {
        messages.push({
          role: msg.role === 'user' ? 'user' : msg.role === 'system' ? 'system' : 'assistant',
          content: msg.content,
        });
      });
    }

    // If an image attachment is present, append a note
    let finalPrompt = prompt;
    if (options?.imageAttachment) {
      finalPrompt = `[User uploaded an image attachment (${options.imageAttachment.mimeType})] ${prompt}`;
    }

    messages.push({ role: 'user', content: finalPrompt });

    try {
      logger.info(`Sending request to Hugging Face Inference API using model ${modelId}...`);
      const response = await postRequest(
        `https://router.huggingface.co/v1/chat/completions`,
        {
          'Authorization': `Bearer ${apiKey}`,
        },
        {
          model: modelId,
          messages,
          temperature,
          max_tokens: maxOutputTokens,
          stream: false,
        },
        90000 // 90 seconds timeout
      );

      if (response.statusCode && response.statusCode >= 400) {
        throw new Error(`HTTP ${response.statusCode}: ${response.body}`);
      }

      const data = JSON.parse(response.body);
      const content = data?.choices?.[0]?.message?.content;
      
      if (!content) {
        throw new Error(`Invalid response format from Hugging Face: ${response.body}`);
      }

      return content;
    } catch (err: any) {
      logger.error(`Hugging Face completion request failed: ${err.message}`);
      throw err;
    }
  }

  async *streamResponse(prompt: string, options?: ProviderChatOptions): AsyncIterable<string> {
    const apiKey = env.HUGGINGFACE_API_KEY;
    const isMockKey = !apiKey || apiKey.includes('your_huggingface') || apiKey.includes('hf_mock');

    if (isMockKey) {
      yield `[MOCK RESPONSE] This is a simulated streaming response from NovaMind AI via the Hugging Face Provider.`;
      return;
    }

    const temperature = options?.temperature !== undefined ? options.temperature : 0.7;
    const maxOutputTokens = options?.maxTokens !== undefined ? options.maxTokens : 2048;
    
    let modelId = options?.model || 'Qwen/Qwen2.5-7B-Instruct';

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
      hostname: 'router.huggingface.co',
      path: '/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
    }, (res) => {
      if (res.statusCode && res.statusCode >= 400) {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          errorToThrow = new Error(`Hugging Face API returned HTTP ${res.statusCode}: ${body}`);
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
              const content = parsed?.choices?.[0]?.delta?.content;
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
      return title.trim().replace(/^["'](.*?)["']$/, '$1') || firstMessage.substring(0, 25);
    } catch (err: any) {
      logger.error(`Hugging Face title generation failed: ${err.message}`);
      return firstMessage.substring(0, 25);
    }
  }

  async generateImage(prompt: string): Promise<Buffer> {
    const enhancedPrompt = `${prompt.trim()}, 8k resolution, highly detailed, cinematic lighting, photorealistic, clean composition, professional digital art, masterpiece`;
    const hfApiKey = env.HUGGINGFACE_API_KEY || env.BFL_API_KEY;
    const isHfPlaceholder = !hfApiKey || hfApiKey.includes('your_huggingface') || hfApiKey.includes('your_bfl') || hfApiKey.includes('hf_mock');
    
    if (!isHfPlaceholder) {
      try {
        logger.info(`HuggingFace Provider generating image via FLUX.1-schnell Serverless Inference...`);
        return await generateImageViaHuggingFace(enhancedPrompt, hfApiKey!);
      } catch (err: any) {
        logger.warn(`HuggingFace FLUX generation failed (${err.message}). Falling back to Pollinations.ai...`);
      }
    } else {
      logger.info(`HuggingFace API Key is not configured. Falling back to Pollinations.ai...`);
    }

    const encodedPrompt = encodeURIComponent(enhancedPrompt);
    const imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=1024&height=1024&nologo=true&private=true&model=flux&enhance=true`;
    return await downloadFileToBuffer(imageUrl);
  }
}
