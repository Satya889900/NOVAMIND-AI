import { User } from '../../models/User';
import { Conversation } from '../../models/Conversation';
import { ApiError } from '../../utils/ApiError';

export const adminService = {
  deleteUserByAdmin: async (userId: string) => {
    const user = await User.findByIdAndDelete(userId);
    if (!user) {
      throw new ApiError(404, 'User not found');
    }
    return user;
  },

  getAllRoomsByAdmin: async () => {
    return await Conversation.find({}).populate('participants', 'name email role');
  },
};
