// Server-only tool. Atomic conflict handling preserves existing decisions.
export async function update_site(opportunity, { signal, fetchImpl = fetch, url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_KEY, log = console.log } = {}) {
  if (!url || !key) throw new Error('Supabase saving is not configured.');
  const endpoint = new URL('/rest/v1/opportunities', url);
  if (endpoint.protocol !== 'https:' || !endpoint.hostname.endsWith('.supabase.co') || endpoint.username || endpoint.password) throw new Error('Supabase URL is invalid.');
  if (!opportunity.title?.trim() || !opportunity.url?.trim() || !opportunity.excerpt?.trim()) throw new Error('A checked source, title and excerpt are required.');
  endpoint.searchParams.set('on_conflict', 'url');
  endpoint.searchParams.set('select', 'id,title,url,source_excerpt,why_it_fits,status,found_at,decided_at');
  const headers = { apikey: key, 'Content-Type': 'application/json', Prefer: 'resolution=ignore-duplicates,return=representation' };
  if (!key.startsWith('sb_secret_')) headers.Authorization = `Bearer ${key}`;
  const response = await fetchImpl(endpoint, {
    method: 'POST', headers, redirect: 'error',
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(10000)]) : AbortSignal.timeout(10000),
    body: JSON.stringify({ title: opportunity.title, url: opportunity.url, source_excerpt: opportunity.excerpt, why_it_fits: opportunity.why_it_fits || 'The source mentions an opportunity relevant to Christchurch or Canterbury.', status: 'new' }),
  });
  if (!response.ok) throw new Error(`Supabase save failed (HTTP ${response.status}).`);
  const rows = await response.json();
  const saved = rows.length > 0;
  log(JSON.stringify({ tool: 'update_site', outcome: saved ? 'saved' : 'duplicate_skipped', ...(saved ? { id: rows[0].id } : {}), title: opportunity.title, url: opportunity.url }));
  return { saved, row: rows[0] ?? null };
}
