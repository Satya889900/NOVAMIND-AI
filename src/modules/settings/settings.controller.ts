import { Request, Response } from 'express';
import { Settings } from '../../models/Settings';
import { sendSuccess } from '../../utils/response';
import { asyncHandler } from '../../utils/asyncHandler';
import { env } from '../../config/env';

export const getProviders = asyncHandler(async (_req: Request, res: Response) => {
  const isMockGroq = !env.GROQ_API_KEY || env.GROQ_API_KEY.includes('mock') || env.GROQ_API_KEY.includes('your_groq');
  const isMockHF = !env.HUGGINGFACE_API_KEY || env.HUGGINGFACE_API_KEY.includes('mock') || env.HUGGINGFACE_API_KEY.includes('your_huggingface');
  const isMockBFL = !env.BFL_API_KEY || env.BFL_API_KEY.includes('mock') || env.BFL_API_KEY.includes('your_bfl');
  const isMockDeepSeek = !env.DEEPSEEK_API_KEY || env.DEEPSEEK_API_KEY.includes('mock') || env.DEEPSEEK_API_KEY.includes('your_deepseek');
  const isMockOpenRouter = !env.OPENROUTER_API_KEY || env.OPENROUTER_API_KEY.includes('mock') || env.OPENROUTER_API_KEY.includes('your_openrouter');
  const isMockOpenAi = !env.OPENAI_API_KEY || env.OPENAI_API_KEY.includes('mock') || env.OPENAI_API_KEY.includes('your_openai');
  const isMockCerebras = !env.CEREBRAS_API_KEY || env.CEREBRAS_API_KEY.includes('mock') || env.CEREBRAS_API_KEY.includes('your_cerebras');
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
        id: 'openai',
        name: 'OpenAI',
        configured: !isMockOpenAi,
        models: [
          { id: 'gpt-4o-mini', name: 'GPT-4o Mini', badge: 'Ultra Fast', description: 'OpenAI\'s cost-efficient, high-speed lightweight model.' },
          { id: 'gpt-4o',      name: 'GPT-4o',      badge: 'Advanced Logic',   description: 'OpenAI\'s flagship high-intelligence model for complex tasks.' },
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
        id: 'deepseek',
        name: 'DeepSeek AI',
        configured: !isMockDeepSeek,
        models: [
          { id: 'deepseek-chat', name: 'DeepSeek V3', badge: 'Intelligence', description: 'DeepSeek V3 model (Turbo). High performance general reasoning and conversation.' },
          { id: 'deepseek-reasoner', name: 'DeepSeek R1', badge: 'Reasoning', description: 'DeepSeek R1 reasoning model (Turbo). Excellent at math, coding, and logical thinking.' },
        ],
      },
      {
        id: 'cerebras',
        name: 'Cerebras AI',
        configured: true,
        models: [
          { id: 'cerebras/llama3.1-8b',    name: 'Llama 3.1 · 8B (Cerebras)',  badge: 'Ultra Fast',    description: 'Cerebras-hosted Llama 3.1 8B running at 1000+ tokens/sec.' },
          { id: 'cerebras/llama-3.3-70b',  name: 'Llama 3.3 · 70B (Cerebras)', badge: 'Advanced Logic', description: 'Cerebras-hosted Llama 3.3 70B — best quality with blazing fast inference.' },
          { id: 'cerebras/llama-4-scout-17b-16e-instruct', name: 'Llama 4 Scout · 17B (Cerebras)', badge: 'Latest',  description: 'Meta Llama 4 Scout 17B — newest Cerebras model with 16 experts MoE architecture.' },
        ],
      },
      {
        id: 'cloudflare',
        name: 'Cloudflare Workers AI',
        configured: true,
        models: [
          { id: 'cloudflare/@cf/meta/llama-3.3-70b-instruct-fp8-fast', name: 'Llama 3.3 · 70B (CF)', badge: 'Best Overall', description: 'Meta Llama 3.3 70B FP8 Fast — best quality model for chat, coding & assistant tasks on Cloudflare edge.' },
        ],
      },
      {
        id: 'openrouter',
        name: 'OpenRouter AI',
        configured: !isMockOpenRouter,
        models: [
          { id: 'openrouter/meta-llama/llama-3.3-70b-instruct', name: 'Llama 3.3 · 70B (OR)', badge: 'Reasoning', description: 'Meta 70B parameter model optimized for conversational reasoning via OpenRouter.' },
          { id: 'openrouter/deepseek/deepseek-r1', name: 'DeepSeek R1 (OR)', badge: 'Deep Reasoning', description: 'DeepSeek R1 reasoning model (Turbo). Excellent at math, coding, and logical thinking via OpenRouter.' },
          { id: 'openrouter/google/gemini-2.5-flash', name: 'Gemini 2.5 Flash (OR)', badge: 'Fast & Efficient', description: 'Google Gemini 2.5 Flash model through OpenRouter.' },
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
    ],
  });
});

export const getSettings = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user.id;

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
  const userId = req.user.id;
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
