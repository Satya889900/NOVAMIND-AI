import { Document } from '../../models/Document';
import { DocumentChunk } from '../../models/DocumentChunk';
import { parserService } from './parser.service';
import { chunkService } from './chunk.service';
import { embeddingService } from './embedding.service';
import { ApiError } from '../../utils/ApiError';
import { logger } from '../../config/logger';

export const documentService = {
  processDocument: async (documentId: string) => {
    const document = await Document.findById(documentId);
    if (!document) {
      throw new ApiError(404, 'Document record not found');
    }

    logger.info(`Starting process flow for document: ${document.originalName} (${document.id})`);

    // Transition: Uploaded -> Processing
    document.status = 'Processing';
    await document.save();

    try {
      // 1. Parse document to text
      const text = await parserService.parseDocumentToText(document.storagePath, document.fileType);
      
      // Transition: Processing -> Completed
      document.status = 'Completed';
      await document.save();

      // 2. Chunk text
      const chunks = chunkService.splitTextIntoChunks(text, 1000, 100);
      logger.info(`Document split into ${chunks.length} chunks`);

      // 3. Save chunks in DB with embeddings (batch size of 5 to prevent rate limit issues)
      const chunkRecords = [];
      const BATCH_SIZE = 5;
      for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
        const batch = chunks.slice(i, i + BATCH_SIZE);
        const promises = batch.map(async (chunk, batchIndex) => {
          const index = i + batchIndex;
          let vector: number[] | undefined;
          try {
            vector = await embeddingService.generateEmbedding(chunk);
          } catch (embedErr: any) {
            logger.warn(`Failed to generate embedding for chunk ${index}: ${embedErr.message}`);
          }
          return {
            documentId: document.id,
            chunkIndex: index,
            content: chunk,
            vector,
          };
        });
        const results = await Promise.all(promises);
        chunkRecords.push(...results);
      }

      if (chunkRecords.length > 0) {
        await DocumentChunk.insertMany(chunkRecords);
      }

      // 4. Save chunks in ChromaDB vector store using LangChain
      try {
        const { chromaService } = require('./chroma.service');
        await chromaService.addDocumentChunks(document.id, chunks);
      } catch (chromaErr: any) {
        logger.warn(`Failed to index document in ChromaDB: ${chromaErr.message}`);
      }

      // 5. Generate AI Summary, Key Takeaways, and Suggested Questions
      try {
        const { geminiService } = require('../ai/gemini.service');
        const truncatedText = text.substring(0, 8000); // Send first 8k chars for summary
        
        const summaryPrompt = `Analyze the following document text and return a JSON object with:
        1. "summary": a brief 3-4 sentence summary of the document.
        2. "keyTakeaways": an array of 3-5 bullet point takeaways.
        3. "suggestedQuestions": an array of 3-4 relevant questions a user might ask about this document.

        Document Text:
        ${truncatedText}

        Return ONLY a valid JSON object in this exact structure, with no markdown code blocks, formatting, or extra commentary. Always respond with pure, parsable JSON.`;

        logger.info(`Requesting AI summary for document ${document.id}`);
        const aiResponseText = await geminiService.generateResponse(summaryPrompt);
        
        // Clean JSON response (strip markdown fences if Gemini added them)
        const cleanJsonText = aiResponseText
          .replace(/```json/g, '')
          .replace(/```/g, '')
          .trim();

        try {
          const parsed = JSON.parse(cleanJsonText);
          document.summary = parsed.summary || '';
          document.keyTakeaways = Array.isArray(parsed.keyTakeaways) ? parsed.keyTakeaways : [];
          document.suggestedQuestions = Array.isArray(parsed.suggestedQuestions) ? parsed.suggestedQuestions : [];
          logger.info(`Successfully generated and saved AI summary for document ${document.id}`);
        } catch (jsonErr: any) {
          logger.warn(`Failed to parse AI summary JSON: ${jsonErr.message}. Response was: "${aiResponseText}"`);
        }
      } catch (summaryErr: any) {
        logger.warn(`Failed to generate document summary: ${summaryErr.message}`);
      }

      // Transition: Completed -> Ready
      document.status = 'Ready';
      await document.save();


      return {
        document,
        chunksProcessed: chunks.length,
      };

    } catch (error: any) {
      logger.error(`Failed to process document ${documentId}: ${error.message}`);
      
      // Transition to Failed
      document.status = 'Failed';
      await document.save();
      
      throw new ApiError(500, `Document processing failed: ${error.message}`);
    }
  },

  /**
   * Reviews a document for grammar, technical errors, formatting issues, fact checking, and suggestions.
   */
  auditDocument: async (documentId: string, userId: string) => {
    const document = await Document.findOne({ _id: documentId, userId });
    if (!document) {
      throw new ApiError(404, 'Document record not found or access denied');
    }

    if (document.auditReport && document.auditReport.trim()) {
      return { document, auditReport: document.auditReport };
    }

    logger.info(`Starting audit review for document: ${document.originalName} (${document.id})`);
    const text = await parserService.parseDocumentToText(document.storagePath, document.fileType);
    const truncatedText = text.substring(0, 15000);

    const auditPrompt = `You are a senior document auditor and technical editor. Perform a thorough review of the following document and provide a structured audit report in clean Markdown:

### 1. 📝 **Grammar, Spelling & Tone**
Identify any spelling mistakes, grammatical issues, awkward phrasing, or inconsistent tone.

### 2. ⚙️ **Technical & Structural Flaws**
Identify incomplete arguments, missing technical details, structural gaps, or undefined terms.

### 3. 📐 **Formatting & Layout Issues**
Point out hierarchy issues, missing headers, broken list numbering, or readability problems.

### 4. 🔍 **Fact Checking & Logic Verification**
Highlight conflicting statements, doubtful numbers/claims, or internal contradictions.

### 5. 💡 **Actionable Suggestions & Improvements**
Provide 3-5 concrete recommendations to make this document professional, clear, and bulletproof.

Document Text:
${truncatedText}`;

    try {
      const { geminiService } = require('../ai/gemini.service');
      const auditReport = await geminiService.generateResponse(auditPrompt);
      
      document.auditReport = auditReport;
      await document.save();

      return { document, auditReport };
    } catch (err: any) {
      logger.error(`Document audit failed for ${documentId}: ${err.message}`);
      throw new ApiError(500, `Failed to audit document: ${err.message}`);
    }
  },
};
