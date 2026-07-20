export interface ProviderMessage {
  role: 'user' | 'model' | 'assistant' | 'system';
  content: string;
}

export interface ProviderChatOptions {
  history?: ProviderMessage[];
  temperature?: number;
  maxTokens?: number;
  model?: string;
  imageAttachment?: {
    mimeType: string;
    data: string; // base64 bytes
  };
  audioAttachment?: {
    mimeType: string;
    data: string; // base64 bytes
  };
}


export interface IAiProvider {
  name: string;
  generateResponse(prompt: string, options?: ProviderChatOptions): Promise<string>;
  streamResponse?(prompt: string, options?: ProviderChatOptions): AsyncIterable<string>;
  generateTitle(firstMessage: string): Promise<string>;
  generateImage?(prompt: string): Promise<Buffer>;
}
