export interface AuthResponsePayload {
  token?: string;
  accessToken?: string;
  refreshToken?: string;
  user: {
    id: string;
    name: string;
    email: string;
    role: string;
  };
}
