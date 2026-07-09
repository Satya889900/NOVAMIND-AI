import jwt from 'jsonwebtoken';
import { env } from '../config/env';

export const jwtService = {
  // Legacy support
  signToken: (id: string, role: string): string => {
    return jwt.sign({ id, role }, env.JWT_SECRET, {
      expiresIn: env.JWT_EXPIRES_IN as any,
    });
  },

  verifyToken: (token: string): any => {
    return jwt.verify(token, env.JWT_SECRET);
  },

  // New access/refresh token signing and verification
  signAccessToken: (id: string, role: string): string => {
    return jwt.sign({ id, role }, env.JWT_SECRET, {
      expiresIn: env.JWT_EXPIRES_IN as any,
    });
  },

  signRefreshToken: (id: string, role: string, deviceId?: string): string => {
    return jwt.sign({ id, role, deviceId }, env.JWT_REFRESH_SECRET, {
      expiresIn: env.JWT_REFRESH_EXPIRES_IN as any,
    });
  },

  verifyAccessToken: (token: string): any => {
    return jwt.verify(token, env.JWT_SECRET);
  },

  verifyRefreshToken: (token: string): any => {
    return jwt.verify(token, env.JWT_REFRESH_SECRET);
  },
};
