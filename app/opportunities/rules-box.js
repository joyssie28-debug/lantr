'use client';
import {useEffect,useState} from 'react';
export default function RulesBox({password}) {
  const [rules,setRules]=useState([]),[text,setText]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[notice,setNotice]=useState('');
  async function request(method='GET',id,body){
    const response=await fetch('/api/opportunities/rules'+(id?`?id=${id}`:''),{method,cache:'no-store',headers:{Authorization:`Bearer ${password}`,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(12000)});
    const value=await response.json();if(!response.ok)throw new Error(value.error||'Rules request failed.');return value;
  }
  useEffect(()=>{let stopped=false;request().then(value=>{if(!stopped)setRules(value.rules);}).catch(e=>{if(!stopped)setError(e.message);});return()=>{stopped=true;};},[password]);
  async function add(event){event.preventDefault();setBusy(true);setError('');try{const value=await request('POST',null,{text});setRules(items=>[value.rule,...items]);setText('');setNotice('Rule saved. Your agent will use it on its next job.');}catch(e){setError(e.message);}finally{setBusy(false);}}
  async function remove(id){const previous=rules;setBusy(true);setError('');setRules(items=>items.filter(item=>item.id!==id));try{await request('DELETE',id);setNotice('Rule removed.');}catch(e){setRules(previous);setError(e.message);}finally{setBusy(false);}}
  return <section className="agent-panel" aria-label="Tell your agent"><h2>Tell your agent</h2><p>Save one sentence for your agent to follow alongside your interests on its next job.</p><form onSubmit={add}><label htmlFor="agent-rule">Your rule</label><input id="agent-rule" value={text} onChange={event=>setText(event.target.value)} placeholder="Only include free opportunities." required maxLength={500}/><button className="button" disabled={busy||!text.trim()}>{busy?'Saving…':'Save rule'}</button></form>{error&&<p className="agent-error" role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}<ul>{rules.map(rule=><li key={rule.id}><p>{rule.text}</p><button className="quiet-button" disabled={busy} onClick={()=>remove(rule.id)} aria-label={`Remove rule: ${rule.text}`}>Remove</button></li>)}</ul>{!rules.length&&<p>No saved rules.</p>}</section>;
}
