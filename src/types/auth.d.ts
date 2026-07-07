export interface JWTPayload {
  id: string;
  role: string;
  iat?: number;
  exp?: number;
}
