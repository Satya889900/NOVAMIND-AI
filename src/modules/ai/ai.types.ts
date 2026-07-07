export interface AIChatMessage {
  role: 'user' | 'model' | 'system';
  content: string;
}
