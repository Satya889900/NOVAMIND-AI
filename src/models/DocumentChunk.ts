import { Schema, model, Types } from 'mongoose';

const DocumentChunkSchema = new Schema(
  {
    documentId: {
      type: Types.ObjectId,
      ref: 'Document',
      required: true,
    },
    chunkIndex: {
      type: Number,
      required: true,
    },
    content: {
      type: String,
      required: true,
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

export const DocumentChunk = model('DocumentChunk', DocumentChunkSchema);
