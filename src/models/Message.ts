import { Schema, model, Types } from 'mongoose';

const MessageSchema = new Schema(
  {
    conversationId: {
      type: Types.ObjectId,
      ref: 'Conversation',
      required: true,
    },
    senderId: {
      type: Types.ObjectId,
      ref: 'User',
      required: true,
    },
    content: {
      type: String,
      required: true,
      trim: true,
    },
    type: {
      type: String,
      enum: ['text', 'image', 'file'],
      default: 'text',
    },
    fileUrl: {
      type: String,
      default: '',
    },
    fileName: {
      type: String,
      default: '',
    },
    model: {
      type: String,
      default: '',
    },
  },
  {
    timestamps: true,
  }
);

export const Message = model('Message', MessageSchema);
