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
        responseModalalities: ['IMAGE'],
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

export class GroqProvider implements IAiProvider {
  name = 'groq';

  async generateResponse(prompt: string, options?: ProviderChatOptions): Promise<string> {
    const apiKey = env.GROQ_API_KEY;
    const isMockKey = !apiKey || apiKey.includes('your_groq_api_key') || apiKey.includes('gsk_mock_groq_api_key');

    if (isMockKey) {
      logger.warn('Groq API Key is not configured or is a placeholder. Using mock fallback.');
      return `[MOCK RESPONSE] This is a simulated response from NovaMind AI via the Groq Provider (Model: ${options?.model || 'llama-3.3-70b-versatile'}). To activate real answers from Groq, please configure a valid GROQ_API_KEY in your backend .env file. Received prompt: "${prompt}"`;
    }

    const temperature = options?.temperature !== undefined ? options.temperature : 0.8;
    const maxOutputTokens = options?.maxTokens !== undefined ? options.maxTokens : 2048;
    
    // Map model names
    let modelId = options?.model || 'llama-3.3-70b-versatile';
    if (!modelId.includes('llama') && !modelId.includes('mixtral') && !modelId.includes('groq')) {
      modelId = 'llama-3.3-70b-versatile';
    }

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

    // If an image attachment is present, append a note since Groq text models don't support multi-modal input
    let finalPrompt = prompt;
    if (options?.imageAttachment) {
      finalPrompt = `[User uploaded an image attachment (${options.imageAttachment.mimeType})] ${prompt}`;
    }

    messages.push({ role: 'user', content: finalPrompt });

    try {
      logger.info(`Sending request to Groq API using model ${modelId}...`);
      const response = await postRequest(
        'https://api.groq.com/openai/v1/chat/completions',
        {
          'Authorization': `Bearer ${apiKey}`,
        },
        {
          model: modelId,
          messages,
          temperature,
          max_tokens: maxOutputTokens,
        },
        90000 // 90 seconds timeout
      );

      if (response.statusCode && response.statusCode >= 400) {
        throw new Error(`HTTP ${response.statusCode}: ${response.body}`);
      }

      const data = JSON.parse(response.body);
      const content = data?.choices?.[0]?.message?.content;
      
      if (!content) {
        throw new Error(`Invalid response format from Groq: ${response.body}`);
      }

      return content;
    } catch (err: any) {
      logger.error(`Groq completion request failed: ${err.message}`);
      throw err;
    }
  }

  async *streamResponse(prompt: string, options?: ProviderChatOptions): AsyncIterable<string> {
    const apiKey = env.GROQ_API_KEY;
    const isMockKey = !apiKey || apiKey.includes('your_groq_api_key') || apiKey.includes('gsk_mock_groq_api_key');

    if (isMockKey) {
      yield `[MOCK RESPONSE] This is a simulated streaming response from NovaMind AI via the Groq Provider. To activate real answers, configure GROQ_API_KEY. Received prompt: "${prompt}"`;
      return;
    }

    const temperature = options?.temperature !== undefined ? options.temperature : 0.8;
    const maxOutputTokens = options?.maxTokens !== undefined ? options.maxTokens : 2048;
    
    let modelId = options?.model || 'llama-3.3-70b-versatile';
    if (!modelId.includes('llama') && !modelId.includes('mixtral') && !modelId.includes('groq')) {
      modelId = 'llama-3.3-70b-versatile';
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
      hostname: 'api.groq.com',
      path: '/openai/v1/chat/completions',
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
          errorToThrow = new Error(`Groq API returned HTTP ${res.statusCode}: ${body}`);
          isDone = true;
          if (resolveNext) resolveNext();
        });
        return;
      }

      let buffer = '';
      res.on('data', (chunk: Buffer) => {
        buffer += chunk.toString('utf-8');
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // save incomplete line

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
      return title.trim().replace(/^["'](.*)["']$/, '$1') || firstMessage.substring(0, 25);
    } catch (err: any) {
      logger.error(`Groq title generation failed: ${err.message}`);
      return firstMessage.substring(0, 25);
    }
  }

  async generateImage(prompt: string): Promise<Buffer> {
    // Groq has no image models, so automatically select the best AI to generate image
    const enhancedPrompt = `${prompt.trim()}, 8k resolution, highly detailed, cinematic lighting, photorealistic, clean composition, professional digital art, masterpiece`;
    
    try {
      if (env.GEMINI_API_KEY) {
        logger.info(`Groq Provider redirecting image generation request to Gemini Imagen...`);
        return await generateImageViaGemini(enhancedPrompt, env.GEMINI_API_KEY);
      } else {
        throw new Error('GEMINI_API_KEY is not configured');
      }
    } catch (err: any) {
      logger.warn(`Gemini Imagen fallback inside Groq failed (${err.message}). Falling back to Pollinations.ai...`);
      const encodedPrompt = encodeURIComponent(enhancedPrompt);
      const imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=1024&height=1024&nologo=true&private=true&model=flux&enhance=true`;
      return await downloadFileToBuffer(imageUrl);
    }
  }
}
