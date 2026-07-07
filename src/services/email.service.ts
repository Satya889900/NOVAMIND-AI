import { logger } from '../config/logger';

export const emailService = {
  sendWelcomeEmail: async (email: string, name: string): Promise<boolean> => {
    logger.info(`Sending welcome email to ${name} (${email}) - Mock implementation`);
    return true;
  },

  sendResetPasswordEmail: async (email: string, token: string): Promise<boolean> => {
    logger.info(`Sending password reset token: ${token} to ${email} - Mock implementation`);
    return true;
  },
};
