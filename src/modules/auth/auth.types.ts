export interface AuthResponsePayload {
  token: string;
  user: {
    id: string;
    name: string;
    email: string;
    role: string;
  };
}
