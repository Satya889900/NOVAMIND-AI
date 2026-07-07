import { Schema, model, Types } from 'mongoose';

const EmbeddingSchema = new Schema(
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
    vectorId: {
      type: String, // ID corresponding to ChromaDB/vector store entry
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

export const Embedding = model('Embedding', EmbeddingSchema);
