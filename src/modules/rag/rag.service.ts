import { retrieverService } from './retriever.service';
import { contextService } from './context.service';
import { promptService } from './prompt.service';
import { geminiService } from '../ai/gemini.service';
import { logger } from '../../config/logger';

export const ragService = {
  answerQuestion: async (query: string, documentId: string): Promise<string> => {
    logger.info(`RAG query requested: "${query}" for document ID: ${documentId}`);

    // 1. Retrieve
    const relevantChunks = await retrieverService.retrieveRelevantChunks(query, documentId);

    // 2. Build Context
    const context = contextService.buildContextString(relevantChunks);

    // 3. Build Prompt
    const prompt = promptService.buildRagPrompt(query, context);

    // 4. Generate Answer via Gemini
    const answer = await geminiService.generateResponse(prompt);

    return answer;
  },
};
