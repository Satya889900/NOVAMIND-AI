import { Request, Response } from 'express';
import { chatService } from './chat.service';
import { sendSuccess } from '../../utils/response';
import { asyncHandler } from '../../utils/asyncHandler';

export const getMessages = asyncHandler(async (req: Request, res: Response) => {
  const messages = await chatService.getMessagesByRoom(req.params.roomId);
  return sendSuccess(res, 'Messages list retrieved successfully', messages);
});

export const sendMessage = asyncHandler(async (req: Request, res: Response) => {
  const { content, type, fileUrl, fileName } = req.body;
  const message = await chatService.createMessage(
    req.params.roomId,
    req.user.id,
    content,
    type,
    fileUrl,
    fileName
  );
  return sendSuccess(res, 'Message sent successfully', message, 21);
});
