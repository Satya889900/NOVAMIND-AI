export function generateConversationTitle(firstMessage: string): string {
  if (!firstMessage) return 'New Chat';
  
  const words = firstMessage.split(' ');
  const title = words.slice(0, 4).join(' ');
  
  return title.length > 25 ? title.substring(0, 22) + '...' : title;
}
