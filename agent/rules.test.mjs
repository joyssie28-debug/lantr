import {test} from 'node:test';
import assert from 'node:assert/strict';
import {loadGuidance,evaluateRules} from './rules.mjs';
const guidance={interests:'Christchurch cooking and jogging',rules:[{text:'Only include free opportunities.'}]};
test('unknown opportunity cost is rejected without an AI request',async()=>{
 const result=await evaluateRules({title:'Event',freeEvidence:null},guidance,{fetchImpl:async()=>{throw new Error('Must not call');}});
 assert.equal(result.allowed,false);assert.match(result.reason,/does not clearly confirm/);
});
test('all rules and interests reach the checker and its rejection is honored',async t=>{
 const old=process.env.OPENAI_API_KEY;process.env.OPENAI_API_KEY='test-key';t.after(()=>{if(old===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=old;});
 const rules={...guidance,rules:[...guidance.rules,{text:'Only on weekends.'}]};
 const checked=await evaluateRules({title:'Weekday event',freeEvidence:'Free entry',evidence:'Tuesday. Free entry.'},rules,{fetchImpl:async(_url,options)=>{
  const body=JSON.parse(options.body),input=JSON.parse(body.input);assert.equal(input.rules.length,2);assert.equal(input.interests,rules.interests);assert.match(body.instructions,/untrusted/);
  return Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({allowed:false,reason:'Tuesday conflicts with the weekend rule.'})}]}]});
 }});assert.equal(checked.allowed,false);
});
test('rule loading reads every page and the deployed interests file',async t=>{
 const oldUrl=process.env.SUPABASE_URL,oldKey=process.env.SUPABASE_SERVICE_KEY;process.env.SUPABASE_URL='https://example.supabase.co';process.env.SUPABASE_SERVICE_KEY='sb_secret_test';t.after(()=>{for(const [name,value]of [['SUPABASE_URL',oldUrl],['SUPABASE_SERVICE_KEY',oldKey]])if(value===undefined)delete process.env[name];else process.env[name]=value;});
 const offsets=[];const loaded=await loadGuidance({fetchImpl:async url=>{offsets.push(url.searchParams.get('offset'));return Response.json(offsets.length===1?Array.from({length:100},(_,id)=>({id,text:'Free.'})):[{id:101,text:'Weekends.'}]);}});
 assert.deepEqual(offsets,['0','100']);assert.equal(loaded.rules.length,101);assert.match(loaded.interests,/Christchurch/);
 await assert.rejects(loadGuidance({fetchImpl:async()=>new Response('',{status:503})}),/Could not read/);
});
