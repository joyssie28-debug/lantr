import { createHash, timingSafeEqual, randomUUID } from 'node:crypto';
import { update_site } from './update-site.mjs';

const SOURCES = ['ccc.govt.nz','christchurchnz.com','volcan.org.nz','volunteeringcanterbury.org.nz','seek.co.nz','trademe.co.nz','eventfinda.co.nz','sportcanterbury.org.nz','parkrun.co.nz'];
export const SEARCHES = {
  all: ['"Christchurch" cooking vacancies site:seek.co.nz','"Christchurch" volunteer opportunities site:volcan.org.nz','"Christchurch" running events site:eventfinda.co.nz'],
  jobs: ['"Christchurch" cooking vacancies site:seek.co.nz','"Christchurch" jobs vacancies site:ccc.govt.nz'],
  grants: ['"Christchurch" community grants applications site:ccc.govt.nz','"Canterbury" funding applications site:sportcanterbury.org.nz'],
};
export function sourceUrl(value) {
  try { const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password&&(!url.port||url.port==='443')&&SOURCES.some(host=>url.hostname===host||url.hostname.endsWith('.'+host))?url:null; } catch { return null; }
}
function decode(value) { return value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Math.min(Number(n),0x10ffff))); }
function plain(value) { return decode(value.replace(/<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi,' ').replace(/<[^>]+>/g,' ')).replace(/\s+/g,' ').trim(); }
function excerpt(value) { return plain(value).split(/\s+/).slice(0,25).join(' '); }
async function boundedFetch(url,signal,fetchImpl=fetch) {
  let current=new URL(url);
  for(let redirects=0;redirects<4;redirects++) {
    if(current.hostname!=='www.bing.com'&&!sourceUrl(current.href))throw new Error('Source is outside the supported sites.');
    const response=await fetchImpl(current,{signal:AbortSignal.any([signal,AbortSignal.timeout(10000)]),redirect:'manual',headers:{'User-Agent':'JoyOpportunities/1.0','Accept':'text/html, application/rss+xml, application/xml'}});
    if(response.status>=300&&response.status<400){current=new URL(response.headers.get('location'),current);continue;}
    if(!response.ok)throw new Error(`Source returned HTTP ${response.status}.`);
    const reader=response.body.getReader();let bytes=0;const chunks=[];
    try { while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>750000)throw new Error('Source page is too large.');chunks.push(Buffer.from(value));} } finally { await reader.cancel(); }
    return {text:Buffer.concat(chunks).toString('utf8'),url:current.href};
  }
  throw new Error('Source redirected too many times.');
}
export async function searchWeb(query,signal) {
  const url=new URL('https://www.bing.com/search');url.searchParams.set('q',query);url.searchParams.set('format','rss');
  const {text}=await boundedFetch(url,signal);
  if(!/<rss\b/i.test(text))throw new Error('Search provider did not return results.');
  const results=[...text.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0,6).map(([,item])=>{
    const field=name=>decode(item.match(new RegExp(`<${name}>([\\s\\S]*?)<\\/${name}>`))?.[1]||'');
    return {title:plain(field('title')).slice(0,200),url:field('link'),excerpt:excerpt(field('description'))};
  });
  // Include a known local board alongside indexed discoveries. These are
  // checked live, never supplied as prewritten results.
  const board=query.includes('volunteer')?{title:'Volunteering Canterbury opportunities',url:'https://volcan.org.nz/opportunities?location=1'}:query.includes('running')?{title:'Hagley parkrun',url:'https://www.parkrun.co.nz/hagley/'}:null;
  return board?[board,...results]:results;
}
export async function readSource(candidate,signal) {
  const page=await boundedFetch(candidate.url,signal);
  const body=plain(page.text);const main=page.text.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1]||page.text;
  const title=plain(page.text.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]||candidate.title).slice(0,200);
  const content=plain(main);const location=/christchurch|canterbury/i.test(body);
  const match=content.match(/.{0,60}\b(?:vacanc\w*|volunteer\w*|apply|application\w*|register|registration|running|run club|grant\w*|funding|event\w*)\b.{0,200}/i);
  if(/captcha|verify you are human|access denied|just a moment/i.test(title)||content.length<100)throw new Error('Source could not be read without a browser.');
  const expiry=page.text.match(/"(?:validThrough|endDate)"\s*:\s*"([^" ]+)"/i)?.[1];
  const specific=/vacanc\w*|volunteer\w*|careers?|jobs?|recruit\w*|running|parkrun|marathon|grant\w*|funding|event\w*|opportunit\w*/i.test(title+' '+new URL(page.url).pathname);
  const links=[...main.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)].map(([,href,label])=>{try{return {url:new URL(decode(href),page.url).href,title:plain(label).slice(0,200)};}catch{return null;}}).filter(item=>item&&item.title&&sourceUrl(item.url)&&/\/opportunities\/[^/?]+|\/job\/\d+/.test(new URL(item.url).pathname)).slice(0,3);
  return {title,url:page.url,excerpt:excerpt(match?.[0]||content),location,relevant:!!match&&specific,links,expiry:expiry&&Number.isFinite(Date.parse(expiry))?Date.parse(expiry):null};
}

export function createOpportunityJobs({secret=process.env.AGENT_SECRET,search=searchWeb,read=readSource,save=update_site,now=Date.now}={}) {
  const jobs=new Map(),attempts=new Map();let starts=[];
  const authHash=secret?createHash('sha256').update(secret).digest():null;
  const snapshot=job=>({jobId:job.id,status:job.status,startedAt:job.startedAt,elapsedMs:(job.finishedAt||now())-job.startedAt,events:job.events,results:job.results,ruledOut:job.ruledOut,error:job.error});
  async function run(job) {
    const signal=AbortSignal.any([job.controller.signal,AbortSignal.timeout(120000)]);
    const event=(type,message,extra={})=>{if(!signal.aborted)job.events.push({type,message,at:now(),...extra});};
    const seen=new Set();let searchesRead=0,pagesRead=0;
    try {
      job.status='running';
      for(const query of SEARCHES[job.kind]) {
        signal.throwIfAborted();event('search','Searching', {query});let candidates;
        try { candidates=await search(query,signal);searchesRead++;event('search_complete',`Found ${candidates.length} candidates`,{query}); }
        catch { signal.throwIfAborted();event('warning','Search provider could not complete this search.',{query});continue; }
        for(const candidate of candidates) {
          signal.throwIfAborted();if(seen.has(candidate.url))continue;seen.add(candidate.url);
          const safe=sourceUrl(candidate.url);
          if(!safe){job.ruledOut.push({title:candidate.title,reason:'Outside the supported local source sites.'});continue;}
          event('source','Reading source',{url:safe.href,title:candidate.title});
          try {
            const page=await read(candidate,signal);signal.throwIfAborted();pagesRead++;
            if(candidates.length<10&&page.links?.length){candidates.push(...page.links.slice(0,10-candidates.length));event('discovery','Discovered opportunity links on this source',{url:page.url});}
            const reason=!page.location?'Christchurch or Canterbury relevance was not established.':!page.relevant?'No opportunity or application information found.':page.expiry!==null&&page.expiry<now()?'The source lists an expired closing or event date.':null;
            if(reason){job.ruledOut.push({title:page.title,url:page.url,excerpt:page.excerpt,reason});event('ruled_out',reason,{url:page.url});}
            else {
              const result={title:page.title,url:page.url,excerpt:page.excerpt,note:'Source checked. Confirm dates, availability and eligibility on the source before applying.'};
              job.results.push(result);event('matched','Found a local opportunity lead',{url:page.url});
              try {
                const saved=await save(result,{signal});
                event('save',saved.saved?'Saved opportunity to Supabase.':'URL already saved; skipped.',{url:page.url});
              } catch {
                signal.throwIfAborted();
                console.error(JSON.stringify({tool:'update_site',outcome:'save_failed',url:page.url}));
                event('warning','Could not save this opportunity to Supabase; the result is still available.',{url:page.url});
              }
            }
          } catch { signal.throwIfAborted();job.ruledOut.push({title:candidate.title,url:safe.href,reason:'Source could not be read; eligibility was not verified.'});event('warning','Source could not be read.',{url:safe.href}); }
        }
      }
      signal.throwIfAborted();
      if(!searchesRead)throw new Error('All searches failed. The search provider may be unavailable; please try again later.');
      if(seen.size&&!pagesRead)throw new Error('No supported source could be read. Review the progress and ruled-out list.');
      job.status='completed';event('completed',`Search complete: ${job.results.length} leads.`);
    } catch(error) { if(job.controller.signal.aborted){job.status='cancelled';}else {job.status='failed';job.error=signal.aborted?'Search timed out after two minutes. Please try again.':error.message;} }
    finally { job.finishedAt=now(); }
  }
  return async(req,res)=>{
    const path=new URL(req.url,'http://localhost').pathname;
    if(!path.startsWith('/api/opportunities/jobs'))return false;
    const reply=(status,value)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value));return true;};
    if(!authHash||secret.length<12||secret.length>256)return reply(503,{error:'The opportunities agent is not configured.'});
    if(req.headers.origin)return reply(403,{error:'Use the website server to access opportunities.'});
    const time=now();for(const [key,value]of attempts)if(time-value.start>600000)attempts.delete(key);
    const ip=req.socket.remoteAddress||'local';if((attempts.get(ip)?.count||0)>=10)return reply(429,{error:'Too many authentication attempts.'});
    const supplied=(req.headers.authorization||'').startsWith('Bearer ')?req.headers.authorization.slice(7):'';
    if(supplied.length>256||!timingSafeEqual(createHash('sha256').update(supplied).digest(),authHash)){const previous=attempts.get(ip)||{count:0,start:time};previous.count++;if(attempts.size<1000||attempts.has(ip))attempts.set(ip,previous);return reply(401,{error:'Agent authentication failed.'});}
    for(const [id,job]of jobs)if(job.finishedAt&&time-job.finishedAt>3600000)jobs.delete(id);
    if(path==='/api/opportunities/jobs'&&req.method==='POST') {
      if(!(req.headers['content-type']||'').startsWith('application/json'))return reply(415,{error:'Send JSON.'});
      let input;try {let raw='';for await(const chunk of req){raw+=chunk.toString();if(Buffer.byteLength(raw)>1024)return reply(413,{error:'Request too large.'});}input=JSON.parse(raw);}catch{return reply(400,{error:'Invalid search request.'});}
      const kind=input?.kind||'all';if(!Object.hasOwn(SEARCHES,kind))return reply(400,{error:'Choose a supported search category.'});
      if([...jobs.values()].some(job=>!job.finishedAt))return reply(429,{error:'An opportunities search is already running.'});
      starts=starts.filter(t=>time-t<86400000);if(starts.length>=20||starts.filter(t=>time-t<3600000).length>=6)return reply(429,{error:'Search limit reached. Please try again later.'});
      const id=randomUUID(),job={id,kind,status:'queued',startedAt:time,events:[],results:[],ruledOut:[],controller:new AbortController(),error:null};jobs.set(id,job);starts.push(time);
      reply(202,{jobId:id,status:'queued'});setImmediate(()=>{void run(job);});return true;
    }
    const id=path.slice('/api/opportunities/jobs/'.length);const job=jobs.get(id);
    if(!job)return reply(404,{error:'Job expired or the agent restarted. Refresh to start a new search.'});
    if(req.method==='GET')return reply(200,snapshot(job));
    if(req.method==='DELETE'){if(!job.finishedAt){job.controller.abort();job.status='cancelled';job.finishedAt=now();job.events.push({type:'cancelled',message:'Search cancelled.',at:now()});}return reply(200,snapshot(job));}
    return reply(405,{error:'Method not allowed.'});
  };
}
