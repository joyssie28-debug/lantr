import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {normalizeMealSettings,budgetSummary} from './meal-settings.mjs';
import {validateRequest,validatePlan,createPlanSchema,createHandler,DAYS} from './server.mjs';
import {validPlan} from '../app/meals/plan-state.mjs';
const secret='test-family-agent-secret';
function plan(coverage,price=100) {
  const slots=coverage==='dinners'?['dinner']:['breakfast','lunch','dinner'];
  return {days:DAYS.map(day=>({day,...Object.fromEntries(slots.map(slot=>[slot,{title:slot+' meal',activeMinutes:10,ingredients:['Rice 200 g'],steps:['Cook and serve.']}]))})),shopping:[{category:'Grains',items:[{name:'Rice',quantity:'2 kg',estimatedNZD:price}]}],prepNotes:['Prices are estimates.']};
}
test('defaults preserve the existing family plan and invalid settings are rejected',()=>{
  assert.deepEqual(normalizeMealSettings(),{budgetNZD:500,familySize:4,coverage:'all',cookingMinutes:45});
  for(const value of [{budgetNZD:0},{budgetNZD:-1},{budgetNZD:10001},{budgetNZD:1.111},{budgetNZD:'50'},{familySize:0},{familySize:2.5},{familySize:21},{coverage:'lunch'}])assert.throws(()=>validateRequest(value));
  assert.equal(validateRequest({budgetNZD:100.25,familySize:2,coverage:'dinners'}).budgetNZD,100.25);
});
test('dinners-only schema, totals and stored plans support custom budgets including overruns',()=>{
  const settings={budgetNZD:75,familySize:2,coverage:'dinners'};
  const result=validatePlan(plan('dinners',90.5),settings);
  assert.equal(result.estimatedTotalNZD,90.5);assert.equal(result.overBudget,true);assert.equal(result.overBudgetNZD,15.5);assert.equal(result.familySize,2);assert.ok(validPlan(result));
  assert.deepEqual(createPlanSchema('dinners').properties.days.items.required,['day','dinner']);
  assert.equal(createPlanSchema('dinners').properties.days.items.properties.dinner.properties.activeMinutes.maximum,45);
  assert.throws(()=>validatePlan(plan('all'),settings),error=>error.code==='meal_coverage');
  assert.ok(validPlan(validatePlan(plan('all',700),{budgetNZD:800,familySize:6,coverage:'all'})));
  assert.equal(budgetSummary(0.1+0.2,0.3).overBudget,false);
});
test('custom cooking time controls the schema and validation and survives saved plans',()=>{
  for(const cookingMinutes of [4,241,12.5])assert.throws(()=>validateRequest({cookingMinutes}));
  const schema=createPlanSchema('all',30).properties.days.items.properties;
  assert.equal(['breakfast','lunch','dinner'].reduce((sum,slot)=>sum+schema[slot].properties.activeMinutes.maximum,0),30);
  assert.equal(createPlanSchema('dinners',90).properties.days.items.properties.dinner.properties.activeMinutes.maximum,90);
  assert.throws(()=>validatePlan(plan('all'),{cookingMinutes:20}),error=>error.code==='daily_time'&&error.evidence.limit===20);
  const dinner=plan('dinners');dinner.days.forEach(day=>{day.dinner.activeMinutes=60;});
  const saved=validatePlan(dinner,{coverage:'dinners',cookingMinutes:90});assert.equal(saved.cookingMinutes,90);assert.ok(validPlan(saved));
});
test('generation sends selected budget, portions and coverage and recalculates prices each time',async t=>{
  const seen=[];
  const handler=createHandler({apiKey:'test-key',agentSecret:secret,readGuidance:async()=>({interests:'Cooking',rules:[]}),log:()=>{},fetchImpl:async(_url,options)=>{
    const body=JSON.parse(options.body),input=JSON.parse(body.input);seen.push(body);
    return Response.json({status:'completed',usage:{input_tokens:50,output_tokens:50},output:[{content:[{type:'output_text',text:JSON.stringify({...plan(input.coverage,input.familySize*20),estimatedTotalNZD:999})}]}]});
  }});
  const server=http.createServer(handler);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();}));
  for(const settings of [{budgetNZD:50,familySize:2,coverage:'dinners',cookingMinutes:20},{budgetNZD:75,familySize:6,coverage:'all',cookingMinutes:60}]){
    const response=await fetch(`http://127.0.0.1:${server.address().port}/api/plan`,{method:'POST',headers:{Authorization:'Bearer '+secret,'Content-Type':'application/json'},body:JSON.stringify(settings)});
    assert.equal(response.status,200);const result=await response.json();
    assert.equal(result.plan.estimatedTotalNZD,settings.familySize*20);assert.equal(result.plan.overBudget,settings.familySize*20>settings.budgetNZD);
    assert.equal(result.report.checks.meals,settings.coverage==='dinners'?7:21);assert.ok(validPlan(result.plan));
    const request=seen.at(-1);assert.match(request.instructions,new RegExp('NZD '+settings.budgetNZD));assert.match(request.instructions,new RegExp('for '+settings.familySize+' people'));
    assert.equal(result.plan.cookingMinutes,settings.cookingMinutes);assert.match(request.instructions,new RegExp('below '+settings.cookingMinutes+' minutes'));
    assert.equal(Object.hasOwn(request.text.format.schema.properties.days.items.properties,'breakfast'),settings.coverage==='all');
  }
  assert.equal(seen.length,2);
});
