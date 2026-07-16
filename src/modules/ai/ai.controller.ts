import { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { sendSuccess } from '../../utils/response';
import { chatService } from '../chat/chat.service';
import { aiService } from './ai.service';
import { env } from '../../config/env';
import { ApiError } from '../../utils/ApiError';
import { Settings } from '../../models/Settings';
import { ProviderFactory } from './providers/provider.factory';
import { uploadToCloudinary } from '../../config/multer';

export const handleAiChat = asyncHandler(async (req: Request, res: Response) => {
  const { conversationId, message: userMessage } = req.body;
  const userId = req.user.id;

  if (!env.GEMINI_BOT_ID) {
    throw new ApiError(500, 'GEMINI_BOT_ID is not configured.');
  }

  // 1. Save the user's message
  await chatService.createMessage(conversationId, userId, userMessage, 'text');

  // Fetch or create user settings
  let userSettings = await Settings.findOne({ userId });
  if (!userSettings) {
    userSettings = await Settings.create({
      userId,
      theme: 'system',
      notificationsEnabled: true,
      systemInstructions: 'You are NovaMind AI, a helpful AI assistant.',
      defaultModel: 'gemini-3.1-flash-lite',
      temperature: 0.8,
      maxTokens: 2048,
    });
  }

  const modelName = userSettings.defaultModel;
  const temperature = userSettings.temperature;
  const maxTokens = userSettings.maxTokens;

  let aiMessage;
  if (modelName.toLowerCase().includes('flux')) {
    const provider = ProviderFactory.getProvider(modelName);
    const imageBuffer = await provider.generateImage!(userMessage);
    const cloudResult = await uploadToCloudinary(imageBuffer, 'generated_image.png', 'novamind/ai_generated');
    aiMessage = await chatService.createMessage(
      conversationId,
      env.GEMINI_BOT_ID,
      `Here is your generated image for prompt: "${userMessage}"`,
      'image',
      cloudResult.secure_url,
      'flux_generated_image.png',
      modelName
    );
  } else {
    // 2. Generate AI response (loads history inside)
    const aiResponse = await aiService.generateChatResponse(conversationId, userMessage, {
      model: modelName,
      temperature,
      maxTokens,
    });

    // 3. Save the AI's message
    aiMessage = await chatService.createMessage(
      conversationId,
      env.GEMINI_BOT_ID,
      aiResponse.content,
      aiResponse.type,
      aiResponse.fileUrl,
      aiResponse.fileName,
      modelName
    );
  }

  // 4. Return the AI's response to the frontend
  return sendSuccess(
    res,
    'AI response generated successfully',
    {
      conversationId,
      message: {
        role: 'assistant',
        content: aiMessage.content,
      },
    },
    201
  );
});