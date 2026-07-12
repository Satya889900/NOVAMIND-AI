import { geminiModel } from '../../config/gemini';
import { logger } from '../../config/logger';

export const geminiService = {
  generateResponse: async (prompt: string): Promise<string> => {
    if (geminiModel) {
      try {
        const result = await geminiModel.generateContent(prompt);
        const response = result.response;
        const text = response.text();
        return text || '';
      } catch (error: any) {
        logger.error(`Error generating content via Gemini: ${error.message}`);
      }
    }

    logger.warn('Gemini model not initialized or failed, using static AI fallback response');
    return `This is a simulated response from NovaMind AI Assistant. To activate real answers, configure a valid GEMINI_API_KEY environment variable. Received prompt: "${prompt.substring(0, 50)}..."`;
  },
};
