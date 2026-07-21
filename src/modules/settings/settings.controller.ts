import { Request, Response } from 'express';
import { Settings } from '../../models/Settings';
import { sendSuccess } from '../../utils/response';
import { asyncHandler } from '../../utils/asyncHandler';
import { ApiError } from '../../utils/ApiError';
import { env } from '../../config/env';

export const getProviders = asyncHandler(async (_req: Request, res: Response) => {
  const isMockGroq = !env.GROQ_API_KEY || env.GROQ_API_KEY.includes('mock') || env.GROQ_API_KEY.includes('your_groq');
  const isMockHF = !env.HUGGINGFACE_API_KEY || env.HUGGINGFACE_API_KEY.includes('mock') || env.HUGGINGFACE_API_KEY.includes('your_huggingface');
  const isMockBFL = !env.BFL_API_KEY || env.BFL_API_KEY.includes('mock') || env.BFL_API_KEY.includes('your_bfl');
  const isMockCloudflare = !env.CLOUDFLARE_API_TOKEN || env.CLOUDFLARE_API_TOKEN.includes('your_cloudflare') || env.CLOUDFLARE_API_TOKEN.includes('mock') || !env.CLOUDFLARE_ACCOUNT_ID || env.CLOUDFLARE_ACCOUNT_ID.includes('your_cloudflare');

  return sendSuccess(res, 'AI Provider status retrieved', {
    providers: [
      {
        id: 'gemini',
        name: 'Google Gemini',
        configured: !!env.GEMINI_API_KEY,
        models: [
          { id: 'gemini-3.1-flash-lite', name: 'Gemini 2.5 Flash', badge: 'Fast & Efficient', description: 'Speed-optimized with broad reasoning capabilities.' },
          { id: 'gemini-3.5-flash',      name: 'Gemini 2.5 Pro',   badge: 'Advanced Logic',   description: 'Best for coding, math, and complex reasoning.' },
        ],
      },
      {
        id: 'groq',
        name: 'Groq (Meta Llama)',
        configured: !isMockGroq,
        models: [
          { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 · 70B', badge: 'Lightning Fast', description: 'Ultra-low latency via Groq silicon. Meta 70B parameter model.' },
        ],
      },
      {
        id: 'huggingface',
        name: 'Hugging Face',
        configured: !isMockHF,
        models: [
          { id: 'Qwen/Qwen2.5-7B-Instruct', name: 'Qwen 2.5 · 7B', badge: 'Ultra Fast', description: "Alibaba's speed-optimized 7B open-source model. Responds in under 1 second." },
        ],
      },
      {
        id: 'cloudflare',
        name: 'Cloudflare Workers AI',
        configured: true,
        models: [
          { id: 'cloudflare/@cf/meta/llama-3.3-70b-instruct-fp8-fast', name: 'Llama 3.3 · 70B (CF)', badge: 'Best Overall', description: 'Meta Llama 3.3 70B FP8 Fast — best quality model for chat, coding & assistant tasks on Cloudflare edge.' },
          { id: 'cloudflare/@cf/meta/llama-3.2-3b-instruct',          name: 'Llama 3.2 · 3B (CF Fast)', badge: 'Ultra Fast',   description: 'Meta Llama 3.2 3B — extremely fast response time for chat and general queries.' },
        ],
      },
      {
        id: 'blackforest',
        name: 'Black Forest Labs',
        configured: !isMockBFL || !!env.GEMINI_API_KEY, // If BFL is not set but Gemini is, we fall back to Pollinations/Gemini so it works!
        models: [
          { id: 'flux-schnell', name: 'FLUX.1 Schnell', badge: 'Image Gen', description: 'State-of-the-art 12B parameter text-to-image model. Extremely fast and detailed.' },
        ],
      },
      {
        id: 'pollinations',
        name: 'Pollinations AI',
        configured: true,
        models: [
          { id: 'pollinations-text',  name: 'Pollinations AI (Text)', badge: 'Free & Fast', description: 'Free open-access text generation model powered by Pollinations AI.' },
          { id: 'pollinations-image', name: 'Pollinations FLUX (Image)', badge: 'Image Gen', description: 'Free high-speed FLUX text-to-image generator powered by Pollinations AI.' },
        ],
      },
    ],
  });
});

export const getSettings = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.id || req.user?._id;

  if (!userId) {
    throw new ApiError(401, 'User not authenticated');
  }

  let settings = await Settings.findOne({ userId });

  // If settings don't exist yet, create default settings for this user
  if (!settings) {
    settings = await Settings.create({
      userId,
      theme: 'system',
      notificationsEnabled: true,
      systemInstructions: 'You are NovaMind AI, a helpful AI assistant.',
      defaultModel: 'gemini-3.1-flash-lite',
      temperature: 0.8,
      maxTokens: 2048,
    });
  }

  return sendSuccess(res, 'User settings retrieved successfully', settings);
});

export const updateSettings = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.id || req.user?._id;

  if (!userId) {
    throw new ApiError(401, 'User not authenticated');
  }

  const {
    theme,
    notificationsEnabled,
    systemInstructions,
    defaultModel,
    temperature,
    maxTokens,
  } = req.body;

  let settings = await Settings.findOne({ userId });

  if (!settings) {
    // If not found, create new one
    settings = new Settings({ userId });
  }

  if (theme !== undefined) settings.theme = theme;
  if (notificationsEnabled !== undefined) settings.notificationsEnabled = notificationsEnabled;
  if (systemInstructions !== undefined) settings.systemInstructions = systemInstructions;
  if (defaultModel !== undefined) settings.defaultModel = defaultModel;
  if (temperature !== undefined) settings.temperature = temperature;
  if (maxTokens !== undefined) settings.maxTokens = maxTokens;

  await settings.save();

  return sendSuccess(res, 'User settings updated successfully', settings);
});
