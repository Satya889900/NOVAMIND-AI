import mongoose from 'mongoose';
import { env } from './env';
import { logger } from './logger';
import { User } from '../models/User';
import bcrypt from 'bcryptjs';

export const connectDB = async (): Promise<void> => {
  try {
    const conn = await mongoose.connect(env.MONGODB_URI);
    logger.info(`MongoDB Connected: ${conn.connection.host}`);

    // Seed dummy user credentials if they don't exist
    const demoEmail = 'demo@novamind.ai';
    const demoUser = await User.findOne({ email: demoEmail });
    if (!demoUser) {
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash('password123', salt);
      await User.create({
        name: 'Demo User',
        email: demoEmail,
        password: hashedPassword,
        role: 'user',
        status: 'offline',
      });
      logger.info('Dummy credentials (demo@novamind.ai / password123) successfully seeded!');
    }

    // Seed Gemini Bot User if it doesn't exist
    const geminiBotId = '6a4f70cea2ba595922f0714b';
    const geminiBot = await User.findById(geminiBotId);
    if (!geminiBot) {
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash('bot_no_password_auth_disabled_123', salt);
      await User.create({
        _id: geminiBotId,
        name: 'Gemini Pro',
        email: 'gemini@novamind.ai',
        password: hashedPassword,
        role: 'user',
        status: 'online',
      });
      logger.info('Gemini AI Assistant bot successfully seeded!');
    }
  } catch (error: any) {
    logger.error(`Error connecting to MongoDB: ${error.message}`);
    process.exit(1);
  }
};

