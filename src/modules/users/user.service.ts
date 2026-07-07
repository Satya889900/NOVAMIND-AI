import { User } from '../../models/User';
import { ApiError } from '../../utils/ApiError';
import { UpdateProfilePayload } from './user.types';

export const userService = {
  getUserById: async (id: string) => {
    const user = await User.findById(id);
    if (!user) {
      throw new ApiError(404, 'User not found');
    }
    return user;
  },

  getAllUsers: async () => {
    return await User.find({});
  },

  updateUserProfile: async (id: string, data: UpdateProfilePayload) => {
    const user = await User.findByIdAndUpdate(id, data, { new: true });
    if (!user) {
      throw new ApiError(404, 'User not found');
    }
    return user;
  },
};
