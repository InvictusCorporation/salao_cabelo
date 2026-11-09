import { randomBytes, createHash, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
const derive = promisify(scrypt);
export const digest = value => createHash('sha256').update(value).digest('hex');
export const secret = () => randomBytes(32).toString('base64url');
export function passwordValid(password) { return typeof password === 'string' && password.length >= 12 && password.length <= 128; }
export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const key = await derive(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return `scrypt$${salt}$${key.toString('hex')}`;
}
export async function verifyPassword(password, hash) {
  const [,salt,expected] = hash.split('$');
  const key = await derive(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return timingSafeEqual(key, Buffer.from(expected, 'hex'));
}
export function safeUser(user) {
  return { id: user.id, name: user.name, email: user.email, role: user.role, professionalId: user.professional_id, clientId: user.client_id, mustChange: Boolean(user.must_change) };
}
export function createSession(db, userId) {
  const token = secret(), csrf = secret(), expires = Date.now() + 12 * 60 * 60 * 1000;
  db.prepare('DELETE FROM sessions WHERE expires<?').run(Date.now());
  db.prepare('INSERT INTO sessions(token_hash,user_id,csrf,expires) VALUES(?,?,?,?)').run(digest(token),userId,csrf,expires);
  return { token, csrf };
}
export function getSession(db, req) {
  const token = req.headers.cookie?.split(';').map(v=>v.trim()).find(v=>v.startsWith('invictus_session='))?.slice(17);
  if (!token || token.length > 128) return null;
  return db.prepare('SELECT u.*,s.csrf,s.token_hash FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires>? AND u.active=1').get(digest(token),Date.now());
}
export function rateLimit(db, bucket, limit = 15) {
  const now = Date.now();
  db.prepare('DELETE FROM auth_attempts WHERE until_ms<?').run(now);
  db.prepare('INSERT INTO auth_attempts(bucket,count,until_ms) VALUES(?,1,?) ON CONFLICT(bucket) DO UPDATE SET count=count+1').run(digest(bucket),now+15*60*1000);
  return db.prepare('SELECT count FROM auth_attempts WHERE bucket=?').get(digest(bucket)).count <= limit;
}
