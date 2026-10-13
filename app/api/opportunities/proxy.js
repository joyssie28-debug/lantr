import { createHash, createHmac, timingSafeEqual, randomBytes } from 'node:crypto';
import { checkPassword } from './auth.js';

const failures=new Map();
const cookieName='joy_opportunity_job';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const json=(status,data,headers={})=>Response.json(data,{status,headers:{'Cache-Control':'no-store',...headers}});
const equal=(a,b)=>timingSafeEqual(createHash('sha256').update(a).digest(),createHash('sha256').update(b).digest());
function sameOrigin(request){const origin=request.headers.get('origin');if(!origin)return true;try{const source=new URL(origin),target=new URL(request.url);return source.origin===origin&&source.host===(request.headers.get('host')||target.host)&&source.protocol===target.protocol;}catch{return false;}}
function signature(payload,password){return createHmac('sha256',password).update('opportunities:'+payload).digest('base64url');}
function session(id,password){const payload=Buffer.from(JSON.stringify({id,expires:Date.now()+3600000,nonce:randomBytes(16).toString('hex')})).toString('base64url');return payload+'.'+signature(payload,password);}
function authorizedJob(request,id,password){try{const raw=request.headers.get('cookie')?.split(';').map(part=>part.trim()).find(part=>part.startsWith(cookieName+'='))?.slice(cookieName.length+1);if(!raw||raw.length>1024)return false;const [payload,sig]=raw.split('.');if(!sig||!equal(sig,signature(payload,password)))return false;const claim=JSON.parse(Buffer.from(payload,'base64url').toString());return claim.id===id&&claim.expires>Date.now();}catch{return false;}}
const safeLink=value=>{try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password?url.href:undefined;}catch{return undefined;}};
const text=(value,max=500)=>typeof value==='string'?value.slice(0,max):'';
function publicJob(value){
  if(!uuid.test(value.jobId)||!['queued','running','completed','failed','cancelled'].includes(value.status))throw new Error('Invalid agent response');
  const cards=items=>(Array.isArray(items)?items:[]).slice(0,50).map(item=>({title:text(item.title,200),url:safeLink(item.url),excerpt:text(item.excerpt,500),note:text(item.note),reason:text(item.reason)}));
  return {jobId:value.jobId,status:value.status,elapsedMs:Number.isFinite(value.elapsedMs)?Math.max(0,value.elapsedMs):0,error:text(value.error),results:cards(value.results),ruledOut:cards(value.ruledOut),events:(Array.isArray(value.events)?value.events:[]).slice(0,200).map(event=>({type:text(event.type,40),message:text(event.message),query:text(event.query),url:safeLink(event.url),title:text(event.title,200)}))};
}
export async function proxyOpportunity(request,action,id){
  const denied=checkPassword(request);if(denied)return denied;
  const {SITE_PASSWORD:password,AGENT_SECRET:secret,AGENT_URL:agentUrl}=process.env;
  if(!password||password.length<12||password.length>256||!secret||secret.length<12||secret.length>256||!agentUrl)return json(503,{error:'Opportunities is not configured yet.'});
  if(!sameOrigin(request))return json(403,{error:'Request origin is not allowed.'});
  let body;
  if(action==='start'){
    const now=Date.now();for(const [key,entry]of failures)if(now-entry.start>=600000)failures.delete(key);
    const ip=request.headers.get('x-forwarded-for')?.split(',')[0].trim()||'local';
    if((failures.get(ip)?.count||0)>=10)return json(429,{error:'Too many password attempts. Try again in 10 minutes.'});
    const auth=request.headers.get('authorization')||'';const supplied=auth.startsWith('Bearer ')?auth.slice(7):'';
    if(supplied.length>256||!equal(supplied,password)){const entry=failures.get(ip)||{count:0,start:now};entry.count++;if(failures.size<1000||failures.has(ip))failures.set(ip,entry);return json(401,{error:'Your site password is incorrect.'});}
    if(!request.headers.get('content-type')?.startsWith('application/json'))return json(415,{error:'Send JSON.'});
    try{const reader=request.body?.getReader();if(!reader)return json(400,{error:'Choose a search category.'});let bytes=0;const chunks=[];const timeout=AbortSignal.timeout(3000);const cancel=()=>{void reader.cancel();};timeout.addEventListener('abort',cancel,{once:true});try{while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>1024){await reader.cancel();return json(413,{error:'Request too large.'});}chunks.push(Buffer.from(value));}timeout.throwIfAborted();}finally{timeout.removeEventListener('abort',cancel);}const input=JSON.parse(Buffer.concat(chunks).toString());if(!['all','jobs','grants'].includes(input.kind))return json(400,{error:'Choose a supported search category.'});body=JSON.stringify({kind:input.kind});}catch{return json(400,{error:'Invalid search request.'});}
  }else{
    if(!uuid.test(id||''))return json(400,{error:'Invalid job ID.'});
    if(!authorizedJob(request,id,password))return json(401,{error:'Your search session expired. Refresh and enter your password again.'});
  }
  try{
    const response=await fetch(`${agentUrl.replace(/\/$/,'')}/api/opportunities/jobs${action==='start'?'':'/'+id}`,{method:action==='start'?'POST':action==='cancel'?'DELETE':'GET',headers:{Authorization:`Bearer ${secret}`,...(body?{'Content-Type':'application/json'}:{})},body,cache:'no-store',redirect:'error',signal:AbortSignal.any([request.signal,AbortSignal.timeout(8000)])});
    if(!response.ok){const messages={401:'The agent connection is not configured correctly.',403:'The agent connection is not configured correctly.',404:'The job expired or the agent needs the Opportunities update. Refresh after restarting the agent.',429:'The agent is busy or its search limit was reached. Try again later.',503:'The opportunities agent is not configured.'};return json(response.status===401||response.status===403?502:response.status,{error:messages[response.status]||'The agent could not process this request.'});}
    const value=await response.json();
    if(action==='start'){
      if(!uuid.test(value.jobId))throw new Error('Invalid job ID');
      const secure=new URL(request.url).protocol==='https:'?'; Secure':'';
      return json(202,{jobId:value.jobId,status:'queued'},{'Set-Cookie':`${cookieName}=${session(value.jobId,password)}; HttpOnly; SameSite=Strict; Path=/api/opportunities; Max-Age=3600${secure}`});
    }
    if(value.jobId!==id)throw new Error('Mismatched job');
    return json(200,publicJob(value));
  }catch{return json(502,{error:'Cannot reach the opportunities agent right now. Check that it is running and try again.'});}
}
