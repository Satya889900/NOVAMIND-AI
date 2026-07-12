import { Socket } from 'socket.io';
import { IUser } from '../models/User';

export interface ExtendedSocket extends Socket {
  userId?: string; // From token
  user?: IUser; // Full user object
}
