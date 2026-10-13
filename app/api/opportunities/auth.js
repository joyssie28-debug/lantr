import { createHash, timingSafeEqual } from 'node:crypto';

export function checkPassword(request) {
  const password = process.env.SITE_PASSWORD;
  if (!password || password.length < 12) return Response.json({error:'Site password is not configured.'},{status:503,headers:{'Cache-Control':'no-store'}});
  const auth = request.headers.get('authorization') || '';
  const supplied = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const hash = value => createHash('sha256').update(value).digest();
  if (supplied.length > 256 || !timingSafeEqual(hash(supplied), hash(password))) return Response.json({error:'Your site password is incorrect.'},{status:401,headers:{'Cache-Control':'no-store'}});
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) return Response.json({error:'Request origin is not allowed.'},{status:403,headers:{'Cache-Control':'no-store'}});
  return null;
}
