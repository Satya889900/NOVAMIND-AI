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
    documentId: {
      type: Schema.Types.ObjectId,
      ref: 'Document',
      required: false,
    },
    summary: {
      type: String,
      default: '',
    },
  },
  {
    timestamps: true,
  }
);

export const Conversation = model('Conversation', ConversationSchema);
