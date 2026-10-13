import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createOpportunityJobs,sourceUrl,readSource } from './opportunities.mjs';
import { proxyOpportunity } from '../app/api/opportunities/proxy.js';
const secret='test-agent-secret-123';
async function server(t,options={}){const handler=createOpportunityJobs({secret,guidance:async()=>({interests:"Christchurch",rules:[]}),save:async()=>({saved:true}),...options});const srv=http.createServer(async(req,res)=>{if(!await handler(req,res)){res.writeHead(404);res.end();}});await new Promise(resolve=>srv.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>{srv.close(resolve);srv.closeAllConnections();}));return `http://127.0.0.1:${srv.address().port}/api/opportunities/jobs`;}
const headers={Authorization:`Bearer ${secret}`,'Content-Type':'application/json'};
const candidate={title:'Local volunteering',url:'https://ccc.govt.nz/volunteer'};
const page={...candidate,excerpt:'Volunteer in Christchurch.',location:true,relevant:true,expiry:null};
async function finished(url,id){for(let i=0;i<100;i++){const result=await(await fetch(`${url}/${id}`,{headers})).json();if(['completed','cancelled','failed'].includes(result.status))return result;await new Promise(resolve=>setTimeout(resolve,5));}throw new Error('Job did not finish');}
test('start returns before work finishes; jobs require authentication; cancel aborts work',async t=>{
 let started=false,aborted=false;const url=await server(t,{search:async(_q,signal)=>{started=true;return new Promise((resolve,reject)=>{signal.addEventListener('abort',()=>{aborted=true;reject(new Error('abort'));},{once:true});});}});
 assert.equal((await fetch(url,{method:'POST',headers:{...headers,Authorization:'Bearer wrong'},body:'{}'})).status,401);
 const start=await fetch(url,{method:'POST',headers,body:'{"kind":"all"}'});assert.equal(start.status,202);const {jobId}=await start.json();
 assert.equal((await fetch(`${url}/${jobId}`)).status,401);
 while(!started)await new Promise(resolve=>setTimeout(resolve,5));
 const cancelled=await(await fetch(`${url}/${jobId}`,{method:'DELETE',headers})).json();assert.equal(cancelled.status,'cancelled');assert.equal(aborted,true);
});
test('sources, progress, duplicate handling and eligibility reasons survive polling',async t=>{
 const expired={...candidate,url:'https://ccc.govt.nz/expired'};const url=await server(t,{search:async()=>[candidate,expired,{title:'Untrusted',url:'https://127.0.0.1/private'}],read:async item=>({...page,url:item.url,expiry:item.url.endsWith('expired')?0:null})});
 const {jobId}=await(await fetch(url,{method:'POST',headers,body:'{"kind":"all"}'})).json();const result=await finished(url,jobId);
 assert.equal(result.status,'completed');assert.equal(result.results.length,1);assert.equal(result.results[0].excerpt,page.excerpt);assert.equal(result.ruledOut.length,2);assert.match(result.ruledOut[0].reason,/expired/);assert.ok(result.events.some(event=>event.type==='source'&&event.url===candidate.url));assert.equal(result.events.filter(event=>event.type==='search').length,3);
});
test('all search failures give a clear terminal error',async t=>{
 const url=await server(t,{search:async()=>{throw new Error('private details');}});const {jobId}=await(await fetch(url,{method:'POST',headers,body:'{"kind":"jobs"}'})).json();const result=await finished(url,jobId);assert.equal(result.status,'failed');assert.match(result.error,/All searches failed/);assert.doesNotMatch(JSON.stringify(result),/private details/);
});
test('only kept sources are saved and save failures preserve returned results',async t=>{
 const saves=[];
 const expired={...candidate,url:'https://ccc.govt.nz/expired'};
 const url=await server(t,{search:async()=>[candidate,expired],read:async item=>({...page,url:item.url,expiry:item.url.endsWith('expired')?0:null}),save:async result=>{saves.push(result);throw new Error('secret diagnostics');}});
 const {jobId}=await(await fetch(url,{method:'POST',headers,body:'{}'})).json();
 const result=await finished(url,jobId);
 assert.equal(result.status,'completed');assert.equal(saves.length,1);assert.equal(result.results.length,1);assert.equal(saves[0].url,candidate.url);
 assert.ok(result.events.some(event=>event.type==='warning'&&event.message.includes('Could not save')));assert.doesNotMatch(JSON.stringify(result),/secret diagnostics/);
});
test('rules load before discovery, blocked opportunities are not saved, rule failures stop jobs',async t=>{
 let loaded=false,saves=0;
 const url=await server(t,{guidance:async()=>{loaded=true;return {interests:'Christchurch',rules:[{text:'Free only.'}]};},search:async()=>{assert.equal(loaded,true);return [candidate];},read:async()=>page,evaluate:async()=>({allowed:false,reason:'Cost unknown.'}),save:async()=>{saves++;}});
 const {jobId}=await(await fetch(url,{method:'POST',headers,body:'{}'})).json();const result=await finished(url,jobId);assert.equal(result.status,'completed');assert.equal(saves,0);assert.equal(result.results.length,0);assert.match(result.ruledOut[0].reason,/Cost unknown/);
 let searched=false;const failing=await server(t,{guidance:async()=>{throw new Error('Could not read rules.');},search:async()=>{searched=true;return [];}});
 const start=await(await fetch(failing,{method:'POST',headers,body:'{}'})).json();assert.equal((await finished(failing,start.jobId)).status,'failed');assert.equal(searched,false);
});
test('only supported HTTPS source hosts are readable',()=>{
 for(const value of ['http://ccc.govt.nz','https://ccc.govt.nz.evil.test','https://localhost','https://ccc.govt.nz:8080','https://user:password@ccc.govt.nz'])assert.equal(sourceUrl(value),null);
 assert.ok(sourceUrl('https://www.ccc.govt.nz/volunteer'));
});
test('a general tourism page mentioning events is not an opportunity result',async t=>{
 const original=globalThis.fetch;t.after(()=>{globalThis.fetch=original;});
 globalThis.fetch=async()=>new Response('<html><title>Things to see and do in Christchurch</title><main>Christchurch and Canterbury welcome visitors. Discover events, beautiful gardens, walks, places to eat, and all the things to see and do around the city.</main></html>');
 const source=await readSource({url:'https://www.christchurchnz.com/visit/things-to-do',title:'Tourism'},new AbortController().signal);
 assert.equal(source.location,true);assert.equal(source.relevant,false);
});
test('website keeps credentials private, binds polling to a signed job cookie and cancels upstream',async t=>{
 const previous={...process.env},original=globalThis.fetch;const id='11111111-1111-4111-8111-111111111111';
 t.after(()=>{globalThis.fetch=original;for(const key of ['SITE_PASSWORD','AGENT_SECRET','AGENT_URL']){if(previous[key]===undefined)delete process.env[key];else process.env[key]=previous[key];}});
 process.env.SITE_PASSWORD='test-site-password';process.env.AGENT_SECRET=secret;process.env.AGENT_URL='https://agent-private.example';let calls=0,lastMethod;
 globalThis.fetch=async(url,options)=>{calls++;lastMethod=options.method;assert.equal(options.headers.Authorization,`Bearer ${secret}`);assert.doesNotMatch(JSON.stringify(options),/test-site-password/);return Response.json(options.method==='POST'?{jobId:id}:{jobId:id,status:'cancelled',elapsedMs:10,events:[],results:[],ruledOut:[]});};
 const request=(password='test-site-password',cookie,origin='http://localhost:3000')=>new Request('http://localhost:3000/api/opportunities',{method:'POST',headers:{Authorization:`Bearer ${password}`,'Content-Type':'application/json',origin,...(cookie?{cookie}:{})},body:'{"kind":"all"}'});
 assert.equal((await proxyOpportunity(request('wrong'),'start')).status,401);assert.equal((await proxyOpportunity(request(undefined,undefined,'https://evil.example'),'start')).status,403);assert.equal(calls,0);
 const response=await proxyOpportunity(request(),'start');assert.equal(response.status,202);const cookie=response.headers.get('set-cookie');assert.match(cookie,/HttpOnly/);assert.match(cookie,/SameSite=Strict/);assert.doesNotMatch(await response.text(),/agent-private|test-agent|test-site-password/);
 assert.equal((await proxyOpportunity(request(),'progress',id)).status,401);
 assert.equal((await proxyOpportunity(request(undefined,cookie),'progress','22222222-2222-4222-8222-222222222222')).status,401);
 const cancel=await proxyOpportunity(request(undefined,cookie),'cancel',id);assert.equal(cancel.status,200);assert.equal(lastMethod,'DELETE');assert.doesNotMatch(await cancel.text(),/agent-private|test-agent|test-site-password/);
});
