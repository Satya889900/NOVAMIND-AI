import bcrypt from 'bcryptjs';
import { User } from '../../models/User';
import { jwtService } from '../../services/jwt.service';
import { ApiError } from '../../utils/ApiError';
import { AuthResponsePayload } from './auth.types';

export const authService = {
  registerUser: async (name: string, email: string, password: string): Promise<AuthResponsePayload> => {
    const existing = await User.findOne({ email });
    if (existing) {
      throw new ApiError(400, 'User already exists with this email address');
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const user = await User.create({
      name,
      email,
      password: hashedPassword,
    });

    const token = jwtService.signToken(user.id, user.role);

    return {
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    };
  },

  loginUser: async (email: string, password: string): Promise<AuthResponsePayload> => {
    const user = await User.findOne({ email }).select('+password');
    if (!user) {
      throw new ApiError(401, 'Invalid email or password');
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      throw new ApiError(401, 'Invalid email or password');
    }

    const token = jwtService.signToken(user.id, user.role);

    return {
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    };
  },
};
