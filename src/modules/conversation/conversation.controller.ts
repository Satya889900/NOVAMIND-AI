import { Request, Response } from 'express';
import { conversationService } from './conversation.service';
import { sendSuccess } from '../../utils/response';
import { asyncHandler } from '../../utils/asyncHandler';

export const getRooms = asyncHandler(async (req: Request, res: Response) => {
  const rooms = await conversationService.getRoomsByUser(req.user.id);
  return sendSuccess(res, 'Rooms list retrieved successfully', rooms);
});

export const createRoom = asyncHandler(async (req: Request, res: Response) => {
  const { name, isGroup, participantIds } = req.body;
  const room = await conversationService.createRoom(
    name,
    isGroup,
    participantIds,
    req.user.id
  );
  return sendSuccess(res, 'Conversation created successfully', room, 21);
});
