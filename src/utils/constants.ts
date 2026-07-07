export const USER_ROLES = {
  USER: 'user',
  ADMIN: 'admin',
} as const;

export const CHAT_TYPES = {
  TEXT: 'text',
  IMAGE: 'image',
  FILE: 'file',
} as const;

export const SOCKET_EVENTS = {
  CONNECTION: 'connection',
  DISCONNECT: 'disconnect',
  JOIN_ROOM: 'join_room',
  LEAVE_ROOM: 'leave_room',
  SEND_MESSAGE: 'send_message',
  MESSAGE_RECEIVED: 'message_received',
  TYPING: 'typing',
  USER_TYPING: 'user_typing',
  STATUS_CHANGED: 'user_status_changed',
} as const;
