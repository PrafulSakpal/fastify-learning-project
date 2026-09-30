import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);
const KEY_LENGTH = 64;

/**
 * Hashes a plain-text password with Node's built-in `scrypt` — no extra
 * dependency (bcrypt/argon2) needed for a learning project. Stored as
 * `<salt>:<hash>`, both hex-encoded, so the salt travels with the hash
 * instead of needing its own column. See docs/fastify/20-jwt.md.
 */
export async function hashPassword(plainTextPassword: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const derivedKey = (await scrypt(plainTextPassword, salt, KEY_LENGTH)) as Buffer;
  return `${salt}:${derivedKey.toString('hex')}`;
}

/**
 * Verifies a plain-text password against a stored `hashPassword()` output.
 * Uses `timingSafeEqual` instead of `===` so comparison time doesn't leak
 * how many leading bytes matched — a real, non-obvious timing-attack
 * mitigation, not decoration.
 */
export async function verifyPassword(plainTextPassword: string, storedHash: string): Promise<boolean> {
  const [salt, hashHex] = storedHash.split(':');
  if (!salt || !hashHex) {
    return false;
  }

  const derivedKey = (await scrypt(plainTextPassword, salt, KEY_LENGTH)) as Buffer;
  const storedKey = Buffer.from(hashHex, 'hex');

  if (derivedKey.length !== storedKey.length) {
    return false;
  }

  return timingSafeEqual(derivedKey, storedKey);
}
