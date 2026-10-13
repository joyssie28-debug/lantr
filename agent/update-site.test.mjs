import {test} from 'node:test';
import assert from 'node:assert/strict';
import {update_site} from './update-site.mjs';
const opportunity={title:'Local volunteering',url:'https://volcan.org.nz/opportunities',excerpt:'Volunteer in Christchurch.'};
test('saves a new checked opportunity with new status and logs its generated ID',async()=>{
 const logs=[];
 const result=await update_site(opportunity,{url:'https://example.supabase.co',key:'sb_secret_test',log:line=>logs.push(line),fetchImpl:async(url,options)=>{
  assert.equal(url.searchParams.get('on_conflict'),'url');assert.equal(options.headers.Prefer,'resolution=ignore-duplicates,return=representation');
  const body=JSON.parse(options.body);assert.equal(body.status,'new');assert.equal(body.source_excerpt,opportunity.excerpt);assert.ok(!Object.hasOwn(body,'id'));assert.ok(!Object.hasOwn(body,'decided_at'));
  return Response.json([{...body,id:12}]);
 }});
 assert.equal(result.row.id,12);assert.equal(result.saved,true);assert.equal(JSON.parse(logs[0]).outcome,'saved');assert.ok(!logs[0].includes('sb_secret_test'));
});
test('duplicate URLs are skipped without overwriting existing decisions',async()=>{
 const result=await update_site(opportunity,{url:'https://example.supabase.co',key:'sb_secret_test',log:()=>{},fetchImpl:async()=>Response.json([])});
 assert.equal(result.saved,false);assert.equal(result.row,null);
});
test('database errors are safe and do not expose response contents',async()=>{
 await assert.rejects(update_site(opportunity,{url:'https://example.supabase.co',key:'sb_secret_test',fetchImpl:async()=>new Response('private diagnostics',{status:403})}),{message:'Supabase save failed (HTTP 403).'});
});
