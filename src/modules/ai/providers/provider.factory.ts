import { IAiProvider } from './provider.interface';
import { GeminiProvider } from './gemini.provider';
import { GroqProvider } from './groq.provider';
import { HuggingFaceProvider } from './huggingface.provider';
import { BlackForestLabsProvider } from './flux.provider';
import { DeepSeekProvider } from './deepseek.provider';
import { OpenRouterProvider } from './openrouter.provider';
import { OpenAiProvider } from './openai.provider';
import { CerebrasProvider } from './cerebras.provider';
import { CloudflareProvider } from './cloudflare.provider';
import { PollinationsProvider } from './pollinations.provider';

export class ProviderFactory {
  private static geminiProvider = new GeminiProvider();
  private static groqProvider = new GroqProvider();
  private static huggingFaceProvider = new HuggingFaceProvider();
  private static fluxProvider = new BlackForestLabsProvider();
  private static deepSeekProvider = new DeepSeekProvider();
  private static openRouterProvider = new OpenRouterProvider();
  private static openAiProvider = new OpenAiProvider();
  private static cerebrasProvider = new CerebrasProvider();
  private static cloudflareProvider = new CloudflareProvider();
  private static pollinationsProvider = new PollinationsProvider();

  /**
   * Returns the AI Provider matching the model name.
   */
  static getProvider(modelName: string): IAiProvider {
    const lowerModel = modelName.toLowerCase();
    
    // Check if the model corresponds to Pollinations AI
    if (lowerModel.includes('pollination')) {
      return this.pollinationsProvider;
    }

    // Check if the model corresponds to OpenRouter (Checked first to avoid keyword collisions)
    if (lowerModel.includes('openrouter')) {
      return this.openRouterProvider;
    }

    // Check if the model corresponds to OpenAI
    if (lowerModel.includes('openai') || lowerModel.startsWith('gpt-')) {
      return this.openAiProvider;
    }

    // Check if the model corresponds to Cloudflare Workers AI
    if (lowerModel.includes('cloudflare/') || lowerModel.includes('@cf/')) {
      return this.cloudflareProvider;
    }

    // Check if the model corresponds to Cerebras
    if (lowerModel.includes('cerebras')) {
      return this.cerebrasProvider;
    }

    // Check if the model corresponds to Black Forest Labs (FLUX)
    if (lowerModel.includes('flux')) {
      return this.fluxProvider;
    }

    // Check if the model corresponds to Groq
    if (
      lowerModel.includes('llama') || 
      lowerModel.includes('groq') || 
      lowerModel.includes('mixtral')
    ) {
      return this.groqProvider;
    }

    // Check if the model corresponds to DeepSeek
    if (lowerModel.includes('deepseek')) {
      return this.deepSeekProvider;
    }

    // Check if the model corresponds to Hugging Face
    if (
      lowerModel.includes('qwen') ||
      lowerModel.includes('huggingface') ||
      lowerModel.includes('hf-')
    ) {
      return this.huggingFaceProvider;
    }
    
    // Default provider is Gemini
    return this.geminiProvider;
  }
}
