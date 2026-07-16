import { Schema, model, Types } from 'mongoose';

const SettingsSchema = new Schema(
  {
    userId: {
      type: Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
    },
    theme: {
      type: String,
      enum: ['light', 'dark', 'system'],
      default: 'system',
    },
    notificationsEnabled: {
      type: Boolean,
      default: true,
    },
    systemInstructions: {
      type: String,
      default: 'You are NovaMind AI, a helpful AI assistant.',
    },
    defaultModel: {
      type: String,
      default: 'gemini-3.1-flash-lite',
    },
    temperature: {
      type: Number,
      default: 0.8,
    },
    maxTokens: {
      type: Number,
      default: 2048,
    },
  },
  {
    timestamps: true,
  }
);

export const Settings = model('Settings', SettingsSchema);
