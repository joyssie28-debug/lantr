import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

const site = parseEnv(readFileSync(new URL('../.env.local', import.meta.url), 'utf8'));
const apiKey = process.env.OPENAI_API_KEY;
const secret = process.env.AGENT_SECRET;
const password = site.SITE_PASSWORD;
const checks = {
  apiKeyPresent: !!apiKey,
  agentSecretValid: !!secret && secret.length >= 12 && secret.length <= 256,
  sitePasswordValid: !!password && password.length >= 12 && password.length <= 256,
  secretsMatch: !!secret && secret === site.AGENT_SECRET,
  agentUrlPresent: !!site.AGENT_URL,
};
console.log(JSON.stringify(checks));
if (Object.values(checks).some(value => !value)) process.exit(1);
try {
  const response = await fetch('https://api.openai.com/v1/models/gpt-4.1-mini', {
    headers: { Authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(10000), redirect: 'error',
  });
  console.log(JSON.stringify({ apiKeyCheck: response.ok ? 'accepted' : 'not accepted', status: response.status }));
  if (!response.ok) process.exitCode = 1;
} catch { console.log(JSON.stringify({ apiKeyCheck: 'network unavailable' })); process.exitCode = 1; }
