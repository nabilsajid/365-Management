import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

// Encrypts the passwords admins hand out before they are stored, so a copy of
// the database alone does not reveal them. The key is derived from the
// service-role key, which exists only on the server. If that key is ever
// replaced, stored passwords can no longer be read and simply need setting again.

function keyFrom(secret: string): Buffer {
  return createHash('sha256').update(`365-management:login-details:${secret}`).digest();
}

export function seal(plain: string, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keyFrom(secret), iv);
  const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), body.toString('base64url')].join('.');
}

/** The original text, or null when it cannot be read (wrong key or damaged value). */
export function open(sealed: string, secret: string): string | null {
  const [version, iv, tag, body] = sealed.split('.');
  if (version !== 'v1' || !iv || !tag || body === undefined) return null;
  try {
    const decipher = createDecipheriv('aes-256-gcm', keyFrom(secret), Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(body, 'base64url')), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}
