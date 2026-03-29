import { type TokenPayload, verifyToken } from './token';

export async function authenticateUpgrade(
  request: Request,
  secret: string,
): Promise<TokenPayload | null> {
  const url = new URL(request.url);
  const token = url.searchParams.get('token');
  if (!token) return null;
  return verifyToken(token, secret);
}
