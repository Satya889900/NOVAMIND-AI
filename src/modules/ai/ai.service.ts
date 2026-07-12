import { geminiModel } from '../../config/gemini';
import { logger } from '../../config/logger';
import { Message } from '../../models/Message';
import { User } from '../../models/User';
import { Conversation } from '../../models/Conversation';
import { ApiError } from '../../utils/ApiError';
import { env } from '../../config/env';

const SYSTEM_INSTRUCTION = `You are NovaMind AI — a helpful, friendly, and intelligent AI assistant built into a real-time chat application called NovaMind.

Key behaviors:
- Respond naturally and conversationally, like a knowledgeable friend.
- Give clear, concise, and helpful answers.
- Use markdown formatting when it helps readability (code blocks, lists, bold, etc.).
- If asked to write code, always wrap it in proper fenced code blocks with the language specified.
- Be warm, supportive, and professional.
- If you don't know something, say so honestly rather than making things up.
- Keep responses focused and avoid unnecessary filler text.`;

export const aiService = {
  /**
   * Generates a response from Gemini based on conversation history.
   * @param conversationId The ID of the conversation.
   * @param userMessage The new message from the user.
   * @returns The generated content from the AI.
   */
  generateChatResponse: async (conversationId: string, userMessage: string): Promise<string> => {
    if (!geminiModel) {
      throw new ApiError(503, 'AI Service is not available. Please configure GEMINI_API_KEY in .env');
    }

    const botId = env.GEMINI_BOT_ID;

    // Load last 20 messages for context
    const messages = await Message.find({ conversationId })
      .sort({ createdAt: 'asc' })
      .limit(20);

    // Build chat history for Gemini (exclude the current user message — it will be sent separately)
    const history = messages
      .filter((msg) => msg.content && msg.content.trim() !== '')
      .map((msg) => ({
        role: botId && msg.senderId.toString() === botId ? 'model' : 'user',
        parts: [{ text: msg.content }],
      }));

    try {
      const chat = geminiModel.startChat({
        history,
        generationConfig: {
          maxOutputTokens: 2048,
          temperature: 0.8,
          topP: 0.95,
        },
      });

      const result = await chat.sendMessage(SYSTEM_INSTRUCTION + '\n\nUser: ' + userMessage);
      const response = result.response;
      const text = response.text();

      if (!text || text.trim() === '') {
        return 'I apologize, but I was unable to generate a response. Please try again.';
      }

      return text;
    } catch (error: any) {
      logger.error(`Error generating Gemini response: ${error.message}`);
      // Return a friendly fallback instead of throwing — so the user still gets a reply
      return `I'm sorry, I encountered an error while processing your message. Please try again. (Error: ${error.message})`;
    }
  },

  /**
   * Ensure the AI Bot user exists in the database.
   * Creates one if it doesn't exist. Returns the bot user's _id.
   */
  ensureBotUser: async (): Promise<string> => {
    const botId = env.GEMINI_BOT_ID;

    if (botId) {
      const existingBot = await User.findById(botId);
      if (existingBot) return botId;
    }

    // Create or find the bot user by email
    let botUser = await User.findOne({ email: 'novamind-ai@novamind.ai' });
    if (!botUser) {
      botUser = await User.create({
        name: 'NovaMind AI',
        email: 'novamind-ai@novamind.ai',
        password: 'bot-account-no-login-' + Date.now(),
        avatarUrl: '',
        role: 'admin',
        status: 'online',
      });
      logger.info(`AI Bot user created with ID: ${botUser._id}`);
    }

    return botUser._id.toString();
  },

  /**
   * Generates a smart, concise title for a new conversation based on the first message.
   */
  generateTitle: async (firstMessage: string): Promise<string> => {
    if (!geminiModel) return firstMessage.substring(0, 20) + '...';

    try {
      const prompt = `Generate a very short, concise title (maximum 4 words) for a chat conversation that starts with this message. Do not use quotes.\n\n"${firstMessage}"\n\nTitle:`;
      const result = await geminiModel.generateContent(prompt);
      let title = result.response.text().trim();
      
      // Remove any surrounding quotes if the AI included them
      title = title.replace(/^["'](.*)["']$/, '$1');
      
      return title || 'New Chat';
    } catch (error) {
      // Fallback if AI generation fails
      return firstMessage.substring(0, 20) + '...';
    }
  },
};