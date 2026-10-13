'use client';
import {useEffect,useRef,useState} from 'react';
import RulesBox from './rules-box';

const active=job=>job&&['queued','running'].includes(job.status);
const duration=ms=>`${Math.floor(ms/60000)}m ${String(Math.floor(ms/1000)%60).padStart(2,'0')}s`;
async function call(url,options={}) {
  const response=await fetch(url,{...options,cache:'no-store',signal:AbortSignal.timeout(12000)});
  const data=await response.json();
  if(!response.ok)throw new Error(data.error||'Request failed. Please try again.');
  return data;
}
function Source({item}) {
  let safe=false;try{const url=new URL(item.url);safe=url.protocol==='https:'&&!url.username&&!url.password;}catch{}
  return safe?<a href={item.url} target="_blank" rel="noopener noreferrer">Read source ↗</a>:null;
}
export default function Opportunities() {
  const [approved,setApproved]=useState([]),[pending,setPending]=useState([]),[password,setPassword]=useState(''),[credential,setCredential]=useState(''),[error,setError]=useState(''),[notice,setNotice]=useState(''),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[deciding,setDeciding]=useState(null),[kind,setKind]=useState('all'),[job,setJob]=useState(null),[elapsed,setElapsed]=useState(0);
  const clock=useRef({at:Date.now(),elapsed:0});
  const headers=()=>({Authorization:`Bearer ${credential}`});
  async function loadSaved(secret='') {
    const publicRows=await call('/api/opportunities');setApproved(publicRows.rows);
    if(secret){const privateRows=await call('/api/opportunities?status=new',{headers:{Authorization:`Bearer ${secret}`}});setPending(privateRows.rows);}
  }
  useEffect(()=>{let stopped=false;call('/api/opportunities').then(value=>{if(!stopped)setApproved(value.rows);}).catch(e=>{if(!stopped)setError(e.message);}).finally(()=>{if(!stopped)setLoading(false);});return()=>{stopped=true;};},[]);
  useEffect(()=>{
    if(!active(job)||!credential)return;
    let stopped=false,timer;
    const tick=async()=>{try{
      const value=await call(`/api/opportunities/${job.jobId}`,{headers:{Authorization:`Bearer ${credential}`}});
      if(stopped)return;clock.current={at:Date.now(),elapsed:value.elapsedMs};setElapsed(value.elapsedMs);setJob(value);
      if(active(value))timer=setTimeout(tick,2500);else await loadSaved(credential);
    }catch(e){if(!stopped)setError(e.message);}};
    timer=setTimeout(tick,1000);return()=>{stopped=true;clearTimeout(timer);};
  },[job?.jobId,job?.status,credential]);
  useEffect(()=>{if(!active(job))return;const timer=setInterval(()=>setElapsed(clock.current.elapsed+Date.now()-clock.current.at),1000);return()=>clearInterval(timer);},[job?.jobId,job?.status]);
  async function unlock(event){event.preventDefault();setBusy(true);setError('');try{const value=await call('/api/opportunities?status=new',{headers:{Authorization:`Bearer ${password}`}});setPending(value.rows);setCredential(password);setPassword('');setNotice('Review unlocked.');}catch(e){setError(e.message);}finally{setBusy(false);}}
  async function refresh(){setBusy(true);setError('');try{const value=await call('/api/opportunities',{method:'POST',headers:{...headers(),'Content-Type':'application/json'},body:JSON.stringify({kind})});clock.current={at:Date.now(),elapsed:0};setElapsed(0);setJob({...value,events:[],results:[],ruledOut:[]});}catch(e){setError(e.message);}finally{setBusy(false);}}
  async function cancel(){setBusy(true);try{setJob(await call(`/api/opportunities/${job.jobId}`,{method:'DELETE',headers:headers()}));await loadSaved(credential);}catch(e){setError(e.message);}finally{setBusy(false);}}
  async function retry(){setError('');try{const value=await call(`/api/opportunities/${job.jobId}`,{headers:headers()});setJob(null);setTimeout(()=>setJob(value),0);}catch(e){setError(e.message);}}
  async function decide(item,action){
    const previousPending=pending,previousApproved=approved;
    setDeciding(item.id);setError('');setPending(rows=>rows.filter(row=>row.id!==item.id));
    if(action==='approve')setApproved(rows=>[...rows,{...item,status:'approved'}].sort((a,b)=>(Date.parse(b.found_at)||0)-(Date.parse(a.found_at)||0)||Number(b.id)-Number(a.id)));
    setNotice(action==='approve'?'Approved — saving…':'Rejected — saving…');
    try{const value=await call(`/api/opportunities/records/${item.id}/${action}`,{method:'POST',headers:headers()});if(action==='approve')setApproved(rows=>rows.map(row=>row.id===item.id?value.row:row));setNotice(action==='approve'?'Opportunity approved.':'Opportunity rejected.');}
    catch(e){setPending(previousPending);setApproved(previousApproved);setNotice('');setError(e.message);}
    finally{setDeciding(null);}
  }
  function lock(){setCredential('');setPending([]);setJob(null);setNotice('Review locked.');void loadSaved().catch(e=>setError(e.message));}
  const cards=(rows,review=false)=><div className="cards opportunity-cards">{rows.map(item=><article className="card" key={item.id}><span className="number">{review?'New / Awaiting review':'Approved / A possibility'}</span><h3>{item.title}</h3>{item.source_excerpt&&<blockquote>{item.source_excerpt}</blockquote>}{item.why_it_fits&&<p>{item.why_it_fits}</p>}<Source item={item}/>{review&&<div className="opportunity-actions"><button className="button" disabled={deciding!==null} onClick={()=>decide(item,'approve')}>Approve</button><button className="quiet-button" disabled={deciding!==null} onClick={()=>decide(item,'reject')}>Reject</button></div>}</article>)}</div>;
  return <><header><a className="logo" href="/">Joy<span>.</span></a><nav aria-label="Main navigation"><a href="/#about">About me</a><a href="/meals">Meal planner</a><a href="/opportunities" aria-current="page">Opportunities</a></nav></header><main className="meal-planner opportunities"><p className="eyebrow">A little room to grow</p><h1>New <span>opportunities.</span></h1><p className="intro">Explore approved jobs, volunteering and events. Follow each source to check dates and eligibility.</p>
    <section className="agent-panel" aria-label="Manage opportunities">{!credential?<form onSubmit={unlock}><label htmlFor="site-password">Your site password</label><input id="site-password" type="password" autoComplete="current-password" required maxLength={256} value={password} onChange={event=>setPassword(event.target.value)}/><button className="button" disabled={busy}>{busy?'Checking…':'Unlock review & Refresh'}</button></form>:<><div className="opportunity-actions"><div><label htmlFor="search-kind">What to explore</label><select id="search-kind" value={kind} onChange={event=>setKind(event.target.value)} disabled={active(job)||busy}><option value="all">Jobs, volunteering & events</option><option value="jobs">Jobs</option><option value="grants">Grants & funding</option></select></div><button className="button" disabled={active(job)||busy} onClick={refresh}>{busy?'Working…':'Refresh opportunities'}</button><button className="quiet-button" disabled={active(job)||deciding!==null||busy} onClick={lock}>Lock review</button></div><p className="shopping-note">Checked results are saved for your review. Only approved opportunities are public.</p></>}</section>
    {error&&<div role="alert" className="agent-error"><p>{error}</p>{active(job)&&<button className="quiet-button" onClick={retry}>Retry progress</button>}</div>}{notice&&<p role="status">{notice}</p>}
    {job&&<section className="opportunity-progress" aria-label="Search progress"><div className="section-head"><h2>{job.status==='completed'?'Search complete':job.status==='failed'?'Search failed':job.status==='cancelled'?'Search cancelled':'Exploring opportunities…'}</h2><span>Elapsed {duration(elapsed)}</span></div><p role="status">{job.events?.at(-1)?.message||'Waiting for the agent…'}</p>{job.error&&<p role="alert">{job.error}</p>}{active(job)&&<button className="quiet-button" disabled={busy} onClick={cancel}>Cancel search</button>}<details className="opportunity-log"><summary>Show searches & source checks ({job.events?.length||0})</summary><ol>{job.events?.map((event,index)=><li key={index}><strong>{event.message}</strong>{event.query&&<p>{event.query}</p>}{event.url&&<Source item={event}/>}</li>)}</ol></details></section>}
    {credential&&<RulesBox password={credential}/>}
    {credential&&<section aria-label="New opportunities"><h2>Awaiting your review ({pending.length})</h2>{!pending.length&&<p>No new opportunities to review. Refresh to search again.</p>}{cards(pending,true)}</section>}
    <section aria-label="Approved opportunities"><h2>Approved opportunities</h2>{loading?<p>Loading opportunities…</p>:!approved.length?<p>No approved opportunities yet.</p>:cards(approved)}</section>
    {credential&&!!job?.ruledOut?.length&&<section className="opportunity-rejections"><h2>What was ruled out</h2><ul>{job.ruledOut.map((item,index)=><li key={index}><h3>{item.title}</h3><p>{item.reason}</p><Source item={item}/></li>)}</ul></section>}
  </main><footer><span>© Joy · My personal space</span><a href="#top">Back to top</a></footer></>;
}
