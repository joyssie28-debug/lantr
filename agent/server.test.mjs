import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {createHandler,validatePlan,DAYS,PLAN_SCHEMA} from './server.mjs';
import {createUsageStore} from './usage.mjs';
import {mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const origin='https://joy-personal-space.joyssie28.chatgpt.site';
const agentSecret='test-only-access-code';
function samplePlan(){return {days:DAYS.map(day=>({day,...Object.fromEntries(['breakfast','lunch','dinner'].map(slot=>[slot,{title:`${slot} meal`,activeMinutes:15,ingredients:['Rice 300 g'],steps:['Cook and serve four portions.']}]))})),shopping:[{category:'Grains',items:[{name:'Rice',quantity:'2 kg',estimatedNZD:10}]}],prepNotes:['Prepare rice for four portions.']};}
async function server(t,options={}){const srv=http.createServer(createHandler({apiKey:'test-key',agentSecret,...options}));await new Promise(resolve=>srv.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>{srv.close(resolve);srv.closeAllConnections();}));return `http://127.0.0.1:${srv.address().port}`;}
const post=(url,code=agentSecret,body={pantry:'rice',preferences:''},extra={})=>fetch(`${url}/api/plan`,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',Authorization:`Bearer ${code}`,...extra},body:JSON.stringify(body)});
test('rejects unauthenticated and disallowed-origin requests before contacting OpenAI',async t=>{let called=0;const url=await server(t,{fetchImpl:async()=>{called++;}});assert.equal((await post(url,'wrong')).status,401);assert.equal((await post(url,agentSecret,{}, {Origin:'https://example.com'})).status,403);assert.equal(called,0);});
test('fails closed when the service has no shared secret',async t=>{const url=await server(t,{agentSecret:undefined});const res=await post(url);assert.equal(res.status,503);});
test('validates request length before contacting OpenAI',async t=>{let called=0;const url=await server(t,{fetchImpl:async()=>{called++;}});assert.equal((await post(url,agentSecret,{pantry:'x'.repeat(3001)})).status,400);assert.equal(called,0);});
test('returns a valid structured plan and restricts generation frequency',async t=>{let seen;const url=await server(t,{fetchImpl:async(_,options)=>{seen=JSON.parse(options.body);return {ok:true,json:async()=>({status:'completed',usage:{input_tokens:1000,output_tokens:4000},output:[{content:[{type:'output_text',text:JSON.stringify(samplePlan())}]}]})};}});const res=await post(url);assert.equal(res.status,200);assert.equal(res.headers.get('access-control-allow-origin'),origin);const data=await res.json();assert.match(data.jobId,/^[0-9a-f-]{36}$/);assert.equal(res.headers.get('x-job-id'),data.jobId);assert.equal(data.plan.days.length,7);assert.equal(data.plan.estimatedTotalNZD,10);assert.equal(seen.store,false);assert.equal(seen.text.format.strict,true);for(let i=1;i<6;i++)assert.equal((await post(url)).status,200);assert.equal((await post(url)).status,429);});
test('rejects over-budget, over-time, duplicate and incomplete plans',()=>{let plan=samplePlan();plan.shopping[0].items[0].estimatedNZD=501;assert.throws(()=>validatePlan(plan));plan=samplePlan();plan.days[0].dinner.activeMinutes=16;assert.throws(()=>validatePlan(plan));plan=samplePlan();plan.shopping[0].items.push({...plan.shopping[0].items[0]});assert.throws(()=>validatePlan(plan));plan=samplePlan();plan.days[0].dinner.steps=[];assert.throws(()=>validatePlan(plan));});
test('rejected plans report the eligibility rule and measured evidence without exposing model text',async t=>{
 const plan=samplePlan();plan.days[0].dinner.activeMinutes=20;plan.prepNotes=['private generated details'];const logs=[];
 const url=await server(t,{log:entry=>logs.push(entry),fetchImpl:async()=>({ok:true,json:async()=>({status:'completed',usage:{input_tokens:100,output_tokens:100},output:[{content:[{type:'output_text',text:JSON.stringify(plan)}]}]})})});
 const response=await post(url);assert.equal(response.status,502);const result=await response.json();
 assert.deepEqual(result.failure,{stage:'eligibility',code:'daily_time',evidence:{dayIndex:0,activeMinutes:50,limit:45}});
 assert.equal(logs.find(entry=>entry.status==='generated').providerStatus,'completed');
 assert.deepEqual(logs.find(entry=>entry.status==='rejected').failure,result.failure);
 assert.doesNotMatch(JSON.stringify({result,logs}),/private generated details|test-key|test-only-access-code/);
});
test('generation schema bounds the day count and daily active time before eligibility checking',()=>{
 const days=PLAN_SCHEMA.properties.days;assert.equal(days.minItems,7);assert.equal(days.maxItems,7);
 const meals=days.items.properties;assert.equal(['breakfast','lunch','dinner'].reduce((sum,slot)=>sum+meals[slot].properties.activeMinutes.maximum,0),45);
 for(const slot of ['breakfast','lunch','dinner'])assert.equal(meals[slot].properties.activeMinutes.minimum,0);
});
test('rejects future-day leftovers without rejecting prior-day leftovers',()=>{
 const plan=samplePlan();plan.days[0].lunch.ingredients=['300g cooked chicken (leftover from Sunday dinner)'];
 assert.throws(()=>validatePlan(plan),error=>error.code==='future_leftovers'&&error.evidence.dayIndex===0&&error.evidence.sourceDayIndex===6);
 plan.days[0].lunch.ingredients=['300g purchased cooked chicken'];plan.days[1].lunch.ingredients=['300g cooked chicken (leftover from Monday dinner)'];
 assert.equal(validatePlan(plan).days.length,7);
});
test('successful results include measured checks and disclose the absence of external sources',async t=>{
 const url=await server(t,{fetchImpl:async()=>({ok:true,json:async()=>({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(samplePlan())}]}]})})});
 const response=await post(url);assert.equal(response.status,200);const {report}=await response.json();
 assert.equal(report.checks.meals,21);assert.equal(report.checks.estimatedTotalNZD,10);assert.equal(report.checks.dailyActiveMinutes[0].minutes,45);
 assert.deepEqual(report.provenance.externalSources,[]);assert.equal(report.alternativesEvaluated,false);
});
test('returns useful quota errors without exposing API credentials',async t=>{const url=await server(t,{fetchImpl:async()=>({ok:false,status:429,json:async()=>({error:{code:'insufficient_quota',message:'private provider details'}})})});const res=await post(url);assert.equal(res.status,502);const text=await res.text();assert.match(text,/billing credit/);assert.doesNotMatch(text,/test-key|private provider details/);});
test('recognizes exhausted billing credit from the live provider error',async t=>{const url=await server(t,{fetchImpl:async()=>({ok:false,status:429,json:async()=>({error:{code:'credit_balance_exhausted',type:'insufficient_quota',message:'private provider details'}})})});const res=await post(url);assert.equal(res.status,502);const text=await res.text();assert.match(text,/billing credit/);assert.doesNotMatch(text,/test-key|private provider details/);});
test('persistent reservations survive restarts and block spending before a provider call',async t=>{
 const folder=mkdtempSync(join(tmpdir(),'joy-usage-'));t.after(()=>rmSync(folder,{recursive:true,force:true}));const path=join(folder,'usage.json');let clock=Date.now();
 let store=createUsageStore(path);for(let i=0;i<5;i++){assert.equal(store.reserve(`job-${i}`,clock),null);store.settle(`job-${i}`,'failed',undefined);}
 store=createUsageStore(path);assert.match(store.reserve('sixth',clock),/spending limit/);
 let calls=0;const url=await server(t,{usageStore:store,now:()=>clock,fetchImpl:async()=>{calls++;}});assert.equal((await post(url)).status,429);assert.equal(calls,0);
 const records=JSON.parse(readFileSync(path,'utf8'));assert.equal(records.jobs.length,5);assert.doesNotMatch(JSON.stringify(records),/test-key|pantry|preferences/);
 clock+=86400001;assert.equal(store.reserve('tomorrow',clock),null);
});
test('token costs release unused reservation and daily count remains enforced across restarts',t=>{
 const folder=mkdtempSync(join(tmpdir(),'joy-count-'));t.after(()=>rmSync(folder,{recursive:true,force:true}));const path=join(folder,'usage.json');const time=Date.now();let store=createUsageStore(path);
 for(let i=0;i<20;i++){const id=`job-${i}`;assert.equal(store.reserve(id,time+Math.floor(i/5)*3600001),null);store.settle(id,'completed',{input_tokens:1000,output_tokens:4000});store=createUsageStore(path);}
 assert.match(store.reserve('21st',time+5*3600001),/generation limit/);const jobs=JSON.parse(readFileSync(path,'utf8')).jobs;assert.equal(jobs[0].costMicroUSD,6800);
 writeFileSync(path,'broken');assert.throws(()=>createUsageStore(path),/cannot be read safely/);
});
test('concurrent jobs and unknown-priced models never make extra API calls',async t=>{
 let release, calls=0;const pending=new Promise(resolve=>release=resolve);const url=await server(t,{fetchImpl:async()=>{calls++;await pending;return {ok:false,status:429,json:async()=>({error:{code:'insufficient_quota'}})};}});
 const first=post(url);while(!calls)await new Promise(r=>setTimeout(r,5));assert.equal((await post(url)).status,429);release();await first;assert.equal(calls,1);
 const other=await server(t,{model:'unknown',fetchImpl:async()=>{calls++;}});assert.equal((await post(other)).status,503);assert.equal(calls,1);
});
