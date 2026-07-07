import { countTokens } from '../../utils/tokenCounter';

export const tokenizerService = {
  estimateTokens: (text: string): number => {
    return countTokens(text);
  },
};
