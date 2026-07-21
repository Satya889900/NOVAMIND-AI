import { IAiProvider, ProviderChatOptions } from './provider.interface';
import { env } from '../../../config/env';
import { logger } from '../../../config/logger';
import https from 'https';
import http from 'http';

const DOWNLOAD_TIMEOUT_MS = 90_000; // 90 seconds — AI image generation can take 30–60s+

/** Socket error codes that are safe to retry (server dropped connection, etc.) */
const RETRIABLE_SOCKET_ERRORS = new Set(['ECONNRESET', 'ECONNREFUSED', 'EPIPE', 'ETIMEDOUT', 'EHOSTUNREACH']);

function downloadFileToBuffer(url: string, attempt = 1): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const req = client.get(url, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume(); // Consume stream to free socket
        return downloadFileToBuffer(res.headers.location, attempt).then(resolve).catch(reject);
      }
      if (res.statusCode && res.statusCode >= 400) {
        res.resume(); // Consume stream to free socket
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

function callBflEndpoint(path: string, method: string, apiKey: string, bodyText?: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.bfl.ai',
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        'x-key': apiKey,
        ...(bodyText && { 'Content-Length': Buffer.byteLength(bodyText) }),
      },
      timeout: 30000,
    };

    const req = https.request(options, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const responseText = Buffer.concat(chunks).toString('utf-8');
        try {
          const parsed = JSON.parse(responseText);
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(`BFL API error (${res.statusCode}): ${responseText}`));
          } else {
            resolve(parsed);
          }
        } catch (e) {
          reject(new Error(`Invalid JSON response: ${responseText}`));
        }
      });
      res.on('error', reject);
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('BFL API request timed out'));
    });

    req.on('error', reject);
    if (bodyText) {
      req.write(bodyText);
    }
    req.end();
  });
}

function generateImageViaCloudflare(prompt: string, accountId: string, apiToken: string, modelId: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      prompt,
      num_steps: 4,
    });

    const options = {
      hostname: 'api.cloudflare.com',
      path: `/client/v4/accounts/${accountId}/ai/run/${modelId}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiToken}`,
      },
      timeout: 25000,
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

        // Try parsing as JSON first, since Workers AI REST API returns image as Base64 wrapped in JSON
        const contentType = res.headers['content-type'] || '';
        const bodyText = buffer.toString('utf-8').trim();
        if (contentType.includes('application/json') || (bodyText.startsWith('{') && bodyText.endsWith('}'))) {
          try {
            const parsed = JSON.parse(bodyText);
            const base64Image = parsed?.result?.image;
            if (base64Image) {
              logger.info(`Successfully parsed Base64 image from Cloudflare response (${modelId})`);
              return resolve(Buffer.from(base64Image, 'base64'));
            }
            if (parsed.errors && parsed.errors.length > 0) {
              return reject(new Error(`Cloudflare error: ${JSON.stringify(parsed.errors)}`));
            }
          } catch (e: any) {
            logger.warn(`Failed to parse Cloudflare response as JSON: ${e.message}`);
          }
        }

        resolve(buffer);
      });
      res.on('error', reject);
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Cloudflare Workers AI image request timed out'));
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

export async function attemptCloudflareImageGen(prompt: string): Promise<Buffer> {
  const cfToken = env.CLOUDFLARE_API_TOKEN;
  const cfAccount = env.CLOUDFLARE_ACCOUNT_ID;
  const hasCf = cfToken && !cfToken.includes('mock') && !cfToken.includes('your_') &&
                cfAccount && !cfAccount.includes('mock') && !cfAccount.includes('your_');

  if (!hasCf) {
    throw new Error('Cloudflare is not configured');
  }

  // Cloudflare image models to try in sequence (Flux first, then fast SD, then ultra-fast LCM)
  const models = [
    '@cf/black-forest-labs/flux-1-schnell',
    '@cf/stabilityai/stable-diffusion-xl-base-1.0',
    '@cf/lykon/dreamshaper-8-lcm',
  ];

  let lastError: any = null;
  for (const modelId of models) {
    try {
      logger.info(`Attempting Cloudflare Workers AI image generation via model ${modelId}...`);
      const buffer = await generateImageViaCloudflare(prompt, cfAccount!, cfToken!, modelId);
      logger.info(`Successfully generated image using Cloudflare Workers AI (${modelId})!`);
      return buffer;
    } catch (err: any) {
      lastError = err;
      logger.warn(`Cloudflare model ${modelId} failed: ${err.message || err}`);
    }
  }

  throw lastError || new Error('All Cloudflare image models failed');
}

let bflKeyInvalid = false;

export class BlackForestLabsProvider implements IAiProvider {
  name = 'blackforest';

  async generateResponse(prompt: string, options?: ProviderChatOptions): Promise<string> {
    return `[IMAGE_GENERATION] ${prompt}`;
  }

  async generateTitle(firstMessage: string): Promise<string> {
    return 'FLUX Image Generation';
  }

  async generateImage(prompt: string): Promise<Buffer> {
    const apiKey = env.BFL_API_KEY;
    const isMockKey = !apiKey || apiKey.includes('your_bfl') || apiKey.includes('bfl_mock') || apiKey.includes('flux_mock');

    const enhancedPrompt = `${prompt.trim()}, 8k resolution, highly detailed, cinematic lighting, photorealistic, clean composition, professional digital art, masterpiece`;

    if (isMockKey || bflKeyInvalid) {
      if (bflKeyInvalid) {
        logger.info('BFL API key is invalid — checking Cloudflare Workers AI fallback...');
      } else {
        logger.info('Black Forest Labs API Key is not configured. checking Cloudflare Workers AI fallback...');
      }
      try {
        return await attemptCloudflareImageGen(enhancedPrompt);
      } catch (cfErr: any) {
        logger.warn(`Cloudflare fallback failed (${cfErr.message}). Falling back to free Pollinations.ai...`);
      }
      const encodedPrompt = encodeURIComponent(enhancedPrompt);
      const imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=1024&height=1024&nologo=true&private=true`;
      return await downloadFileToBuffer(imageUrl);
    }

    try {
      logger.info('Starting image generation task via Black Forest Labs API...');
      // Start task
      const postData = JSON.stringify({
        prompt: enhancedPrompt,
        width: 1024,
        height: 1024,
      });

      // Default to flux-pro-1.1 model for high quality image generation
      const startResult = await callBflEndpoint('/v1/flux-pro-1.1', 'POST', apiKey, postData);
      const taskId = startResult.id;

      if (!taskId) {
        throw new Error('No task ID returned from BFL API');
      }

      logger.info(`BFL Task started successfully. Task ID: ${taskId}. Polling for completion...`);

      // Poll task status (up to 30 seconds, checking every 2 seconds)
      const maxRetries = 15;
      for (let i = 0; i < maxRetries; i++) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        
        const pollResult = await callBflEndpoint(`/v1/get_result?id=${taskId}`, 'GET', apiKey);
        logger.info(`BFL Task status: ${pollResult.status}`);

        if (pollResult.status === 'Ready') {
          const imageUrl = pollResult.result?.sample;
          if (!imageUrl) {
            throw new Error('Image URL was empty in Ready state');
          }
          logger.info(`BFL Image generation complete! Downloading image from ${imageUrl}...`);
          return await downloadFileToBuffer(imageUrl);
        }

        if (pollResult.status === 'Failed') {
          throw new Error('BFL Image generation task failed');
        }
      }

      throw new Error('BFL Image generation timed out');
    } catch (err: any) {
      if (err.message.includes('422') && err.message.toLowerCase().includes('invalid api key')) {
        bflKeyInvalid = true;
        logger.warn('BFL API key is invalid (422). All future requests this session will skip BFL entirely.');
      } else {
        logger.warn(`Black Forest Labs API request failed (${err.message}). Checking Cloudflare Workers AI fallback...`);
      }
      try {
        return await attemptCloudflareImageGen(enhancedPrompt);
      } catch (cfErr: any) {
        logger.warn(`Cloudflare fallback failed (${cfErr.message}). Falling back to Pollinations.ai...`);
      }
      const encodedPrompt = encodeURIComponent(enhancedPrompt);
      const imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=1024&height=1024&nologo=true&private=true`;
      return await downloadFileToBuffer(imageUrl);
    }
  }
}
