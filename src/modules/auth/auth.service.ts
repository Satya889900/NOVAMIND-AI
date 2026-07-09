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

    const accessToken = jwtService.signAccessToken(user.id, user.role);
    const refreshToken = jwtService.signRefreshToken(user.id, user.role);

    return {
      token: accessToken,
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    };
  },

  loginUser: async (email: string, password: string, deviceId?: string): Promise<AuthResponsePayload> => {
    // Ensure demo user exists dynamically on login attempt
    if (email === 'demo@novamind.ai' && password === 'password123') {
      const existing = await User.findOne({ email });
      if (!existing) {
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash('password123', salt);
        await User.create({
          name: 'Demo User',
          email: 'demo@novamind.ai',
          password: hashedPassword,
          role: 'user',
          status: 'offline',
        });
      }
    }

    const user = await User.findOne({ email }).select('+password');
    if (!user) {
      throw new ApiError(401, 'Invalid email or password');
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      throw new ApiError(401, 'Invalid email or password');
    }

    const accessToken = jwtService.signAccessToken(user.id, user.role);
    const refreshToken = jwtService.signRefreshToken(user.id, user.role, deviceId);

    return {
      token: accessToken,
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    };
  },

  refreshTokens: async (refreshToken: string): Promise<AuthResponsePayload> => {
    try {
      const decoded = jwtService.verifyRefreshToken(refreshToken);
      const user = await User.findById(decoded.id);
      if (!user) {
        throw new ApiError(401, 'Invalid refresh token - user not found');
      }

      const accessToken = jwtService.signAccessToken(user.id, user.role);
      const newRefreshToken = jwtService.signRefreshToken(user.id, user.role, decoded.deviceId);

      return {
        token: accessToken,
        accessToken,
        refreshToken: newRefreshToken,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
        },
      };
    } catch (error) {
      throw new ApiError(401, 'Invalid or expired refresh token');
    }
  },
};
