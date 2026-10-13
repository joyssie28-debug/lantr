import 'server-only';
import {checkPassword} from '../auth';
const json=(status,body)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
async function database(params={},options={}) {
  const {SUPABASE_URL:url,SUPABASE_SERVICE_KEY:key}=process.env;
  if(!url||!key)throw new Error('Missing database configuration');
  const endpoint=new URL('/rest/v1/rules',url);endpoint.search=new URLSearchParams(params).toString();
  const response=await fetch(endpoint,{...options,headers:{apikey:key,...(!key.startsWith('sb_secret_')?{Authorization:`Bearer ${key}`}:{ }),...options.headers},cache:'no-store',redirect:'error',signal:AbortSignal.timeout(8000)});
  if(!response.ok)throw new Error('Database request failed');return response.json();
}
export const runtime='nodejs';
export const maxDuration=15;
export async function GET(request) {
  const denied=checkPassword(request);if(denied)return denied;
  try{const rules=[];for(let offset=0;;offset+=100){const page=await database({select:'id,text,created_at',order:'created_at.desc,id.desc',limit:'100',offset:String(offset)});rules.push(...page);if(page.length<100)break;}return json(200,{rules});}
  catch{return json(502,{error:'Could not load rules. Please try again.'});}
}
export async function POST(request) {
  const denied=checkPassword(request);if(denied)return denied;
  let text;
  try{const raw=await request.text();if(raw.length>2048)return json(413,{error:'Your rule is too long.'});text=JSON.parse(raw).text?.trim();}catch{return json(400,{error:'Enter one sentence for your agent.'});}
  if(typeof text!=='string'||!text||text.length>500||/[\r\n]/.test(text))return json(400,{error:'Enter one sentence, up to 500 characters.'});
  try{const rows=await database({select:'id,text,created_at'},{method:'POST',headers:{'Content-Type':'application/json',Prefer:'return=representation'},body:JSON.stringify({text})});return json(201,{rule:rows[0]});}
  catch{return json(502,{error:'Could not save your rule. Please try again.'});}
}
export async function DELETE(request) {
  const denied=checkPassword(request);if(denied)return denied;
  const id=new URL(request.url).searchParams.get('id');if(!/^\d+$/.test(id||''))return json(400,{error:'Invalid rule ID.'});
  try{const rows=await database({id:`eq.${id}`,select:'id'},{method:'DELETE',headers:{Prefer:'return=representation'}});return rows.length?json(200,{removed:rows[0].id}):json(404,{error:'Rule not found.'});}
  catch{return json(502,{error:'Could not remove the rule. Please try again.'});}
}
