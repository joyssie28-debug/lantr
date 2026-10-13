import 'server-only';
import { checkPassword } from './auth';
const json=(status,body)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
const fields='id,title,url,source_excerpt,why_it_fits,status,found_at,decided_at';
async function database(query,options={}) {
  const {SUPABASE_URL:url,SUPABASE_SERVICE_KEY:key}=process.env;
  if(!url||!key)throw new Error('Database not configured');
  const endpoint=new URL('/rest/v1/opportunities',url);
  endpoint.search=query;
  const headers={apikey:key,...(!key.startsWith('sb_secret_')?{Authorization:`Bearer ${key}`}:{})};
  const response=await fetch(endpoint,{...options,headers:{...headers,...options.headers},cache:'no-store',redirect:'error',signal:AbortSignal.timeout(8000)});
  if(!response.ok)throw new Error('Database request failed');
  return response.json();
}
export async function listOpportunities(request) {
  const status=new URL(request.url).searchParams.get('status')||'approved';
  if(!['approved','new','rejected'].includes(status))return json(400,{error:'Invalid opportunity status.'});
  if(status!=='approved'){const denied=checkPassword(request);if(denied)return denied;}
  try {return json(200,{rows:await database(new URLSearchParams({select:fields,status:`eq.${status}`,order:'found_at.desc,id.desc',limit:'200'}).toString())});}
  catch{return json(502,{error:'Could not load saved opportunities. Please try again.'});}
}
export async function decideOpportunity(request,id,action) {
  const denied=checkPassword(request);if(denied)return denied;
  if(!/^\d+$/.test(id)||!['approve','reject'].includes(action))return json(400,{error:'Invalid opportunity decision.'});
  try {
    const rows=await database(new URLSearchParams({id:`eq.${id}`,status:'eq.new',select:fields}).toString(),{method:'PATCH',headers:{'Content-Type':'application/json',Prefer:'return=representation'},body:JSON.stringify({status:action==='approve'?'approved':'rejected',decided_at:new Date().toISOString()})});
    return rows.length?json(200,{row:rows[0]}):json(409,{error:'This opportunity was already decided or no longer exists.'});
  }catch{return json(502,{error:'Could not save your decision. Please try again.'});}
}
