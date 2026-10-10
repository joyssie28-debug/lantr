import { createHash, timingSafeEqual } from 'node:crypto';

export const runtime = 'nodejs';
export const maxDuration = 150;
const failures = new Map();
const hash = value => createHash('sha256').update(value).digest();
const reply = (status, error) => Response.json({ error }, { status, headers: { 'Cache-Control': 'no-store' } });

export async function POST(request) {
  const deadline = AbortSignal.timeout(150000);
  const { SITE_PASSWORD: password, AGENT_SECRET: secret, AGENT_URL: url } = process.env;
  if (!password || password.length < 12 || password.length > 256 || !secret || secret.length < 12 || secret.length > 256 || !url) {
    return reply(503, 'The planner is not configured yet.');
  }
  const origin = request.headers.get('origin');
  if (origin) {
    const requestUrl = new URL(request.url);
    // Next.js can use its internal hostname in request.url. The Host header
    // retains the address the browser actually used, including the port.
    const host = request.headers.get('host') || requestUrl.host;
    let sameOrigin = false;
    try {
      const browserUrl = new URL(origin);
      sameOrigin = browserUrl.origin === origin && browserUrl.host === host && browserUrl.protocol === requestUrl.protocol;
    } catch {}
    if (!sameOrigin) return reply(403, 'Request origin is not allowed.');
  }
  const now = Date.now();
  for (const [key, entry] of failures) if (now - entry.start >= 600000) failures.delete(key);
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'local';
  if ((failures.get(ip)?.count || 0) >= 10) return reply(429, 'Too many password attempts. Try again in 10 minutes.');
  const header = request.headers.get('authorization') || '';
  const supplied = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (supplied.length > 256 || !timingSafeEqual(hash(supplied), hash(password))) {
    const entry = failures.get(ip) || { count: 0, start: now };
    entry.count++;
    if (failures.size >= 1000 && !failures.has(ip)) return reply(429, 'Please try again later.');
    failures.set(ip, entry);
    return reply(401, 'Your site password is incorrect.');
  }
  if (!request.headers.get('content-type')?.startsWith('application/json')) return reply(415, 'Send the request as JSON.');
  let body = '';
  try {
    const reader = request.body?.getReader();
    if (!reader) return reply(400, 'Please enter valid meal preferences.');
    const stopReading = () => { reader.cancel().catch(() => {}); };
    deadline.addEventListener('abort', stopReading, { once: true });
    const chunks = []; let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 16384) { await reader.cancel(); return reply(413, 'Your request is too large.'); }
      chunks.push(Buffer.from(value));
    }
    deadline.removeEventListener('abort', stopReading);
    deadline.throwIfAborted();
    body = Buffer.concat(chunks).toString('utf8');
    JSON.parse(body);
  } catch { return reply(400, 'Please enter valid meal preferences.'); }
  try {
    const response = await fetch(`${url.replace(/\/$/, '')}/api/plan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secret}` },
      body, signal: AbortSignal.any([deadline, request.signal, AbortSignal.timeout(125000)]), cache: 'no-store', redirect: 'error',
    });
    if (response.status === 401 || response.status === 403) return reply(502, 'The cooking agent connection is not configured correctly.');
    const result = await response.json();
    return Response.json(result, { status: response.status, headers: { 'Cache-Control': 'no-store' } });
  } catch { return reply(502, 'Cannot reach your cooking agent right now. Please try again shortly.'); }
}
