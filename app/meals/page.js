'use client';
import {useEffect,useState} from 'react';
import Image from 'next/image';
import {DEFAULT_MEAL_SETTINGS,normalizeMealSettings,mealSlots,budgetSummary} from '../../agent/meal-settings.mjs';
import {starterMeals,starterGroceries} from './meal-data';
import {validPlan} from './plan-state.mjs';

const checklistKey='joy-shopping-v1',planKey='joy-ai-plan-v1',settingsKey='joy-meal-settings-v1';
const money=value=>'NZ$'+new Intl.NumberFormat('en-NZ',{minimumFractionDigits:2,maximumFractionDigits:2}).format(value);
export default function Meals() {
  const [checked,setChecked]=useState([]),[ready,setReady]=useState(false),[storageError,setStorageError]=useState(false),[plan,setPlan]=useState(null);
  const [budget,setBudget]=useState('500'),[familySize,setFamilySize]=useState('4'),[coverage,setCoverage]=useState('all');
  const [cookingMinutes,setCookingMinutes]=useState('45');
  const [pantry,setPantry]=useState(''),[preferences,setPreferences]=useState(''),[sitePassword,setSitePassword]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
  const chosen={budgetNZD:Number(budget),familySize:Number(familySize),coverage,cookingMinutes:Number(cookingMinutes)};
  const applied=plan?normalizeMealSettings(plan):DEFAULT_MEAL_SETTINGS;
  const changed=chosen.budgetNZD!==applied.budgetNZD||chosen.familySize!==applied.familySize||chosen.coverage!==applied.coverage||chosen.cookingMinutes!==applied.cookingMinutes;
  const summary=plan?budgetSummary(plan.shopping.flatMap(group=>group.items).reduce((sum,item)=>sum+item.estimatedNZD,0),applied.budgetNZD):null;
  useEffect(()=>{
    try {
      const checks=JSON.parse(localStorage.getItem(checklistKey)||'[]');if(Array.isArray(checks))setChecked(checks.filter(item=>typeof item==='string'));
      const saved=JSON.parse(localStorage.getItem(planKey)||'null');if(validPlan(saved))setPlan(saved);
      const settings=normalizeMealSettings(JSON.parse(localStorage.getItem(settingsKey)||'null')||(validPlan(saved)?saved:DEFAULT_MEAL_SETTINGS));
      setBudget(String(settings.budgetNZD));setFamilySize(String(settings.familySize));setCoverage(settings.coverage);
      setCookingMinutes(String(settings.cookingMinutes));
    }catch{setStorageError(true);}setReady(true);
  },[]);
  useEffect(()=>{if(ready)try{localStorage.setItem(checklistKey,JSON.stringify(checked));}catch{setStorageError(true);}},[checked,ready]);
  useEffect(()=>{if(ready)try{if(plan)localStorage.setItem(planKey,JSON.stringify(plan));}catch{setStorageError(true);}},[plan,ready]);
  useEffect(()=>{
    if(!ready)return;let settings;try{settings=normalizeMealSettings(chosen);}catch{return;}
    try{localStorage.setItem(settingsKey,JSON.stringify(settings));}catch{setStorageError(true);}
  },[budget,familySize,coverage,cookingMinutes,ready]);
  async function generate(event) {
    event.preventDefault();if(busy)return;setError('');let settings;
    try{settings=normalizeMealSettings(chosen);}catch(e){setError(e.message);return;}
    setBusy(true);setMessage(`Planning ${settings.coverage==='dinners'?'7 dinners':'21 meals'} for ${settings.familySize} people and recalculating your shopping list. This may take a minute or two.`);
    try {
      const response=await fetch('/api/plan',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${sitePassword}`},body:JSON.stringify({pantry,preferences,...settings}),signal:AbortSignal.timeout(150000)});
      const result=await response.json();if(!response.ok)throw new Error(result.error||'Meal generation failed.');
      if(!validPlan(result.plan)||['budgetNZD','familySize','coverage','cookingMinutes'].some(key=>result.plan[key]!==settings[key]))throw new Error('The agent returned a plan that does not match your settings. Your current plan is unchanged.');
      setPlan(result.plan);setChecked([]);setSitePassword('');setMessage(result.plan.overBudget?'Your plan is ready, but its estimated cost exceeds your budget. See the warning below.':'Your updated plan and shopping list are ready.');
    }catch(e){setMessage('');setError(e.name==='TimeoutError'?'The request took too long. Your current plan is unchanged. Please try again.':e instanceof TypeError?'Cannot reach your cooking agent. Your current plan is unchanged.':e.message);}
    finally{setBusy(false);}
  }
  const groceries=plan?plan.shopping.map(group=>({category:group.category,items:group.items.map(item=>({...item,label:`${item.name} — ${item.quantity}`}))})):Object.entries(starterGroceries).map(([category,items])=>({category,items:items.map(label=>({label}))}));
  const allItems=groceries.flatMap(group=>group.items.map(item=>item.label));
  function toggle(label){setChecked(items=>items.includes(label)?items.filter(item=>item!==label):[...items,label]);}
  return <><header><a className="logo" href="/">Joy<span>.</span></a><nav><a href="/">About Joy</a><a href="#shopping">Shopping list</a><a href="/opportunities">Opportunities</a></nav></header>
    <main className="meal-planner meal-look-dark">
      <section className="meal-intro"><div className="meal-intro-copy"><p className="eyebrow">A little joy in the kitchen</p><h1>Your week,<br/><span>on a plate.</span></h1><p className="intro">A mix of flavours, shared ingredients and less everyday planning. Choose your family size, weekly budget and meals to plan.</p></div>
        <div className="meal-banner"><Image src="/meal-banner.avif" alt="A collage of different foods for meal inspiration" fill sizes="(max-width: 760px) 100vw, 1120px" preload style={{objectFit:'cover'}}/></div>
      </section>
      <section className="agent-panel" aria-labelledby="agent-title"><h2 id="agent-title">Plan with your cooking assistant</h2><p>Update your settings to regenerate the meals, ingredient quantities and shopping list together.</p>
        <form onSubmit={generate}><div className="meal-budget-controls">
          <div><label htmlFor="weekly-budget">Weekly budget (NZD)</label><input id="weekly-budget" type="number" min="1" max="10000" step="0.01" inputMode="decimal" required value={budget} onChange={e=>setBudget(e.target.value)} disabled={busy}/></div>
          <div><label htmlFor="family-size">Family size</label><input id="family-size" type="number" min="1" max="20" step="1" required value={familySize} onChange={e=>setFamilySize(e.target.value)} disabled={busy}/></div>
          <div><label htmlFor="meal-coverage">Budget covers</label><select id="meal-coverage" value={coverage} onChange={e=>setCoverage(e.target.value)} disabled={busy}><option value="all">All meals — breakfast, lunch & dinner</option><option value="dinners">Dinners only</option></select></div>
          <div><label htmlFor="cooking-time">Cooking time (minutes per day)</label><input id="cooking-time" type="number" min="5" max="240" step="1" required value={cookingMinutes} onChange={e=>setCookingMinutes(e.target.value)} disabled={busy}/></div>
        </div><p className="shopping-note">Cooking time means active preparation for all selected meals that day, excluding oven or simmering time. {storageError?'Browser storage is unavailable; settings work for this visit.':'Settings and plans are saved in this browser on this device.'}</p>
          {changed&&<p role="status" className="shopping-note">Settings changed. Click “Update meal plan” to apply them; the menu and shopping list below still use the previous settings.</p>}
          <label htmlFor="pantry">Ingredients you already have</label><textarea id="pantry" maxLength={3000} rows={3} value={pantry} onChange={e=>setPantry(e.target.value)} placeholder="For example: rice, six eggs, carrots, chicken in the freezer" disabled={busy}/>
          <label htmlFor="preferences">Anything you would like this week?</label><textarea id="preferences" maxLength={1000} rows={2} value={preferences} onChange={e=>setPreferences(e.target.value)} placeholder="For example: two vegetarian dinners, more Korean food" disabled={busy}/>
          <label htmlFor="access-code">Your private site password</label><input id="access-code" type="password" autoComplete="current-password" minLength={12} maxLength={256} required value={sitePassword} onChange={e=>setSitePassword(e.target.value)} disabled={busy}/><p className="shopping-note">Your password is not saved in this browser.</p>
          <button className="button" type="submit" disabled={busy||!ready}>{busy?'Updating your meal plan…':'Update meal plan'}</button><p className="agent-message" role="status">{message}</p>{error&&<p className="agent-error" role="alert">{error}</p>}
        </form>
      </section>
      <section aria-labelledby="menu-title"><h2 id="menu-title">This week’s menu</h2><p>Cooking times are estimates of active time each day. {plan?'Your generated plan is saved in this browser.':'The starter plan covers all meals for four people; update it to apply your choices.'}</p>
        {summary&&<><p className="budget-estimate">Estimated shopping total: <strong>{money(summary.estimatedTotalNZD)}</strong> / {money(applied.budgetNZD)} for {applied.coverage==='dinners'?'dinners only':'all meals'}. Prices are estimates, not live supermarket quotes.</p>{summary.overBudget&&<p role="alert" className="agent-error">Over budget by <strong>{money(summary.overBudgetNZD)}</strong>. Increase the budget or adjust your preferences and update the meal plan.</p>}</>}
        <div className="meal-grid">{(plan?plan.days:starterMeals.map(([day,breakfast,lunch,dinner,time])=>({day,breakfast:{title:breakfast},lunch:{title:lunch},dinner:{title:dinner},time}))).map(day=><article className="meal-day" key={day.day}><div className="meal-day-heading"><h3>{day.day}</h3><span>{plan?mealSlots(applied.coverage).reduce((sum,slot)=>sum+day[slot].activeMinutes,0):day.time} min</span></div><dl>{mealSlots(applied.coverage).map(slot=><div key={slot}><dt>{slot}</dt><dd>{day[slot].title}{plan&&<Recipe meal={day[slot]} familySize={applied.familySize}/>}</dd></div>)}</dl></article>)}</div>
      </section>
      <section className="meal-shopping" id="shopping"><h2>One shopping list</h2><p>Quantities cover {applied.coverage==='dinners'?'the seven dinners':'all planned meals'} for {applied.familySize} people, including planned leftovers. Check your cupboards first. All prices are estimates and may differ at checkout.</p><div className="shopping-actions"><p aria-live="polite">{checked.filter(item=>allItems.includes(item)).length} of {allItems.length} items checked</p><button onClick={()=>setChecked([])} disabled={!ready||!checked.length}>Reset checklist</button><button onClick={()=>window.print()}>Print plan & list</button></div><p className="shopping-note">{storageError?'Your browser cannot save your checklist.':'Your checks are saved in this browser, on this device.'}</p><div className="shopping-grid">{groceries.map(group=><fieldset key={group.category}><legend>{group.category}</legend>{group.items.map(item=><label className={checked.includes(item.label)?'shopping-item is-checked':'shopping-item'} key={item.label}><input type="checkbox" checked={checked.includes(item.label)} disabled={!ready} onChange={()=>toggle(item.label)}/><span>{item.label}{Number.isFinite(item.estimatedNZD)&&<small className="shopping-price">Estimated {money(item.estimatedNZD)}</small>}</span></label>)}</fieldset>)}</div></section>
      <section className="closing"><h2>Cook once. Enjoy twice.</h2>{plan?<ul>{plan.prepNotes.map((note,index)=><li key={index}>{note}</li>)}</ul>:<p>Make extra portions where the starter plan calls for leftovers. Reserve them for the lunches in the plan.</p>}</section>
    </main><footer><span>Joy’s cooking planner</span><a href="/">Back to my website</a></footer></>;
}
function Recipe({meal,familySize}) {return <details className="meal-recipe"><summary>Recipe for {familySize}</summary><p>{meal.activeMinutes} min active cooking</p><h4>Ingredients</h4><ul>{meal.ingredients.map((item,index)=><li key={index}>{item}</li>)}</ul><h4>Steps</h4><ol>{meal.steps.map((step,index)=><li key={index}>{step}</li>)}</ol></details>;}
