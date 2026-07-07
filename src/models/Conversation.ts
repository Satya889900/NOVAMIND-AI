import { Schema, model, Types } from 'mongoose';

const ConversationSchema = new Schema(
  {
    name: {
      type: String,
      trim: true,
      default: '',
    },
    isGroup: {
      type: Boolean,
      default: false,
    },
    avatarUrl: {
      type: String,
      default: '',
    },
    participants: [
      {
        type: Types.ObjectId,
        ref: 'User',
      },
    ],
    lastMessage: {
      type: Types.ObjectId,
      ref: 'Message',
    },
  },
  {
    timestamps: true,
  }
);

export const Conversation = model('Conversation', ConversationSchema);
