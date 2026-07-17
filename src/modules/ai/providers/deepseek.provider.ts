import { IAiProvider, ProviderChatOptions } from './provider.interface';
import { postRequest } from './httpClient';
import { env } from '../../../config/env';
import { logger } from '../../../config/logger';

export class DeepSeekProvider implements IAiProvider {
  name = 'deepseek';

  async generateResponse(prompt: string, options?: ProviderChatOptions): Promise<string> {
    const apiKey = env.DEEPSEEK_API_KEY;
    const isMockKey = !apiKey || apiKey.includes('your_deepseek_api_key') || apiKey.includes('mock');

    if (isMockKey) {
      logger.warn('DeepSeek API Key is not configured or is a placeholder. Using mock fallback.');
      return `[MOCK RESPONSE] This is a simulated response from NovaMind AI via the DeepSeek Provider (Model: ${options?.model || 'deepseek-chat'}). To activate real answers from DeepSeek, please configure a valid DEEPSEEK_API_KEY in your backend .env file. Received prompt: "${prompt}"`;
    }

    const temperature = options?.temperature !== undefined ? options.temperature : 0.7;
    const maxOutputTokens = options?.maxTokens !== undefined ? options.maxTokens : 2048;
    
    let modelId = options?.model || 'deepseek-chat';
    if (modelId.toLowerCase().includes('reason')) {
      modelId = 'deepseek-reasoner';
    } else {
      modelId = 'deepseek-chat';
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

    try {
      logger.info(`Sending request to DeepSeek API using model ${modelId}...`);
      const response = await postRequest(
        'https://api.deepseek.com/chat/completions',
        {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
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
        throw new Error(`Invalid response format from DeepSeek: ${response.body}`);
      }

      return content;
    } catch (err: any) {
      logger.error(`DeepSeek completion request failed: ${err.message}`);
      throw err;
    }
  }

  async generateTitle(firstMessage: string): Promise<string> {
    const prompt = `Generate a very short chat title (3-5 words max) summarizing this message. No quotes, no punctuation at end.\n\nMessage: "${firstMessage}"\n\nTitle:`;
    try {
      const title = await this.generateResponse(prompt, { temperature: 0.2 });
      return title.trim().replace(/^["'](.*)["']$/, '$1') || firstMessage.substring(0, 25);
    } catch (err: any) {
      logger.error(`DeepSeek title generation failed: ${err.message}`);
      return firstMessage.substring(0, 25);
    }
  }

  async generateImage(prompt: string): Promise<Buffer> {
    throw new Error('DeepSeek does not support image generation.');
  }
}
