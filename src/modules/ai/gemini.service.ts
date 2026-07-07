import { aiClient } from '../../config/gemini';
import { logger } from '../../config/logger';

export const geminiService = {
  generateResponse: async (prompt: string): Promise<string> => {
    if (aiClient) {
      try {
        const response = await aiClient.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: prompt,
        });

        if (response.text) {
          return response.text;
        }
      } catch (error: any) {
        logger.error(`Error generating content via Gemini: ${error.message}`);
      }
    }

    // Fallback response if Client is not initialized
    logger.warn('Gemini client not initialized or failed, using static AI fallback response');
    return `This is a simulated response from NovaMind AI Assistant. To activate real answers, configure a valid GEMINI_API_KEY environment variable. Received prompt: "${prompt.substring(0, 50)}..."`;
  },
};
