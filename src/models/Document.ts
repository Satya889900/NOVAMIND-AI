import { Schema, model, Types } from 'mongoose';

const DocumentSchema = new Schema(
  {
    userId: {
      type: Types.ObjectId,
      ref: 'User',
      required: true,
    },
    conversationId: {
      type: Types.ObjectId,
      ref: 'Conversation',
      required: false,
    },
    fileName: {
      type: String,
      required: true,
      trim: true,
    },
    originalName: {
      type: String,
      required: true,
      trim: true,
    },
    fileType: {
      type: String,
      required: true,
    },
    fileSize: {
      type: Number,
      required: true,
    },
    storagePath: {
      type: String,
      required: true,
    },
    cloudinaryPublicId: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ['Uploaded', 'Processing', 'Completed', 'Ready', 'Failed'],
      default: 'Uploaded',
    },
  },
  {
    timestamps: true,
  }
);

export const Document = model('Document', DocumentSchema);
