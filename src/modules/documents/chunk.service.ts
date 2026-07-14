export const chunkService = {
  splitTextIntoChunks: (text: string, chunkSize = 1000, chunkOverlap = 100): string[] => {
    if (!text) return [];

    const chunks: string[] = [];
    let startIndex = 0;

    // Ensure chunkOverlap is less than chunkSize
    const overlap = chunkOverlap >= chunkSize ? 0 : chunkOverlap;
    const step = chunkSize - overlap;

    while (startIndex < text.length) {
      const endIndex = Math.min(startIndex + chunkSize, text.length);
      const chunk = text.substring(startIndex, endIndex);
      chunks.push(chunk);
      
      // Stop if we have reached the end of the text
      if (endIndex >= text.length) break;

      startIndex += step;
      
      // Prevent infinite loop if step is 0 or negative
      if (step <= 0) break;
    }

    return chunks;
  },
};
