import jwt from 'jsonwebtoken';
import { env } from '../config/env';

export const jwtService = {
  signToken: (id: string, role: string): string => {
    return jwt.sign({ id, role }, env.JWT_SECRET, {
      expiresIn: env.JWT_EXPIRES_IN as any,
    });
  },

  verifyToken: (token: string): any => {
    return jwt.verify(token, env.JWT_SECRET);
  },
};
