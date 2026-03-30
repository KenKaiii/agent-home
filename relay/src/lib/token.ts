import { ClientType } from '@agent-home/protocol';
import { SignJWT, jwtVerify } from 'jose';

export interface TokenPayload {
  clientId: string;
  clientType: ClientType;
}

function getSecretKey(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

export async function createToken(payload: TokenPayload, secret: string): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('30d')
    .setIssuedAt()
    .setIssuer('agent-home')
    .setAudience('relay')
    .sign(getSecretKey(secret));
}

export async function verifyToken(token: string, secret: string): Promise<TokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey(secret), {
      algorithms: ['HS256'],
      issuer: 'agent-home',
      audience: 'relay',
    });
    return {
      clientId: payload.clientId as string,
      clientType: payload.clientType as ClientType,
    };
  } catch {
    return null;
  }
}
