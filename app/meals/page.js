'use client';
import { useEffect, useState } from 'react';

const starterMeals = [
 ['Monday','Overnight oats, bananas and yoghurt','Hummus and salad wraps','Lemon chicken skillet, microwave potatoes and broccoli',45],
 ['Tuesday','Eggs on toast and fruit','Leftover chicken wraps','Beef and vegetable stir-fry with rice',40],
 ['Wednesday','Yoghurt, muesli and berries','Tuna and chickpea salad','Coconut chickpea and spinach curry with rice',40],
 ['Thursday','Porridge with apples','Leftover curry','Fish tacos with cabbage slaw',40],
 ['Friday','Scrambled eggs on toast','Cheese, hummus and salad sandwiches','Quick beef and tomato pasta with green salad',45],
 ['Saturday','Pancakes, yoghurt and fruit','Leftover beef pasta sauce on microwave potatoes','Vegetable pizzas on ready-made bases',45],
 ['Sunday','Eggs and mushrooms on toast','Chickpea couscous bowls','Chicken noodle soup with vegetables',45]
];
const starterGroceries = {
 'Protein':['Chicken — 2.5 kg','Beef strips — 800 g','Beef mince — 1.2 kg','Fish — 1 kg','Eggs — 30','Tuna — 3 cans','Chickpeas — 6 cans'],
 'Grains':['Oats — 1 kg','Muesli — 500 g','Bread — 3 loaves','Wraps — 20','Small tortillas — 12','Rice — 1 kg','Pasta — 500 g','Couscous — 500 g','Noodles — 300 g','Pizza bases — 4','Flour — 500 g'],
 'Dairy':['Milk — 5 litres','Plain yoghurt — 2 kg','Cheese — 700 g','Butter'],
 'Vegetables':['Potatoes — 3 kg','Onions — 1 kg','Carrots — 1 kg','Broccoli — 2 heads','Capsicums — 6','Cabbage — 1','Spinach — 500 g','Lettuce — 3','Cucumbers — 2','Tomatoes — 1 kg','Mushrooms — 500 g','Garlic and ginger'],
 'Fruit':['Bananas — 12','Apples — 12','Oranges — 8','Frozen berries — 1 kg','Lemons or limes — 4'],
 'Pantry':['Hummus — 500 g','Canned tomatoes — 4 cans','Coconut milk — 2 cans','Stock','Tomato paste','Oil','Soy sauce','Curry spices','Baking powder']
};
const key = 'joy-shopping-v1';
const planKey = 'joy-ai-plan-v1';

function validPlan(plan) {
 try {
  if (!plan || !Array.isArray(plan.days) || plan.days.length !== 7 || !Array.isArray(plan.shopping) || !plan.shopping.length || !Array.isArray(plan.prepNotes) || !plan.prepNotes.every(x => typeof x === 'string')) return false;
  for (let i=0;i<7;i++) {
   const day=plan.days[i]; if (day.day!==starterMeals[i][0]) return false;
   let minutes=0;
   for (const slot of ['breakfast','lunch','dinner']) { const meal=day[slot]; if (!meal || typeof meal.title!=='string' || !Number.isInteger(meal.activeMinutes) || meal.activeMinutes<0 || !Array.isArray(meal.steps) || !meal.steps.length || !meal.steps.every(x=>typeof x==='string') || !Array.isArray(meal.ingredients) || !meal.ingredients.length || !meal.ingredients.every(x=>typeof x==='string')) return false; minutes+=meal.activeMinutes; }
   if (minutes>45) return false;
  }
  let total=0;
  for (const group of plan.shopping) { if (typeof group.category!=='string' || !Array.isArray(group.items) || !group.items.length) return false; for (const item of group.items) { if (typeof item.name!=='string' || typeof item.quantity!=='string' || !Number.isFinite(item.estimatedNZD) || item.estimatedNZD<0) return false; total+=item.estimatedNZD; } }
  return total<=500 && Number.isFinite(plan.estimatedTotalNZD) && Math.abs(total-plan.estimatedTotalNZD)<0.02;
 } catch { return false; }
}
export default function Meals() {
 const [checked,setChecked] = useState([]);
 const [ready,setReady] = useState(false);
 const [storageError,setStorageError] = useState(false);
 const [plan,setPlan] = useState(null);
 const [pantry,setPantry] = useState('');
 const [preferences,setPreferences] = useState('');
 const [sitePassword,setSitePassword] = useState('');
 const [busy,setBusy] = useState(false);
 const [error,setError] = useState('');
 const [message,setMessage] = useState('');
 useEffect(()=>{try{const stored=JSON.parse(localStorage.getItem(key)||'[]');if(Array.isArray(stored))setChecked(stored.filter(x=>typeof x==='string')); const saved=JSON.parse(localStorage.getItem(planKey)||'null');if(validPlan(saved))setPlan(saved);}catch{setStorageError(true);}setReady(true);},[]);
 useEffect(()=>{if(ready)try{localStorage.setItem(key,JSON.stringify(checked));}catch{setStorageError(true);}},[checked,ready]);
 useEffect(()=>{if(ready)try{if(plan)localStorage.setItem(planKey,JSON.stringify(plan));else localStorage.removeItem(planKey);}catch{setStorageError(true);}},[plan,ready]);
 function toggle(item){setChecked(previous=>previous.includes(item)?previous.filter(x=>x!==item):[...previous,item]);}
 async function generate(event) {
  event.preventDefault(); if(busy)return; setBusy(true);setError('');setMessage('Planning 21 meals and combining your shopping list. This may take a minute or two.');
  try {
   const response=await fetch('/api/plan',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${sitePassword}`},body:JSON.stringify({pantry,preferences}),signal:AbortSignal.timeout(150000)});
   const result=await response.json();if(!response.ok)throw new Error(result.error||'Meal generation failed. Please try again.');
   if(!validPlan(result.plan))throw new Error('The agent returned an incomplete plan. Your current plan is still saved; please try again.');
   setPlan(result.plan);setChecked([]);setMessage('Your new weekly plan is ready. Open each recipe to see ingredients and steps.');setSitePassword('');
  } catch(error) {setMessage('');setError(error.name==='TimeoutError'?'The request took too long. Please try again.':error instanceof TypeError?'Cannot reach your cooking agent right now. Please try again shortly.':error.message);}
  finally {setBusy(false);}
 }
 const meals=plan ? plan.days.map(day=>[day.day,day.breakfast.title,day.lunch.title,day.dinner.title,day.breakfast.activeMinutes+day.lunch.activeMinutes+day.dinner.activeMinutes]) : starterMeals;
 const groceries=plan ? plan.shopping.reduce((groups,group)=>({...groups,[group.category]:[...(groups[group.category]||[]),...group.items.map(item=>`${item.name} — ${item.quantity}`)]}),{}) : starterGroceries;
 const total=Object.values(groceries).flat().length;
 return <><header><a className="logo" href="/">Joy<span>.</span></a><nav><a href="/">About Joy</a><a href="#shopping">Shopping list</a><a href="/opportunities">Opportunities</a></nav></header><main className="meal-planner"><p className="eyebrow">A little joy in the kitchen</p><h1>Your week,<br/><span>on a plate.</span></h1><p className="intro">Breakfast, lunch and dinner for four. A mix of flavours, shared ingredients and less everyday planning.</p><div className="meal-settings"><span>4 people</span><span>NZ$500 weekly budget</span><span>No allergies</span><span>Up to 45 min cooking / day</span></div><section className="agent-panel" aria-labelledby="agent-title"><h2 id="agent-title">Plan with your cooking assistant</h2><p>Tell me what is in your kitchen and what you feel like eating. I will plan three meals a day for four, using your NZ$500 budget.</p><form onSubmit={generate}><label htmlFor="pantry">Ingredients you already have</label><textarea id="pantry" maxLength={3000} rows={3} value={pantry} onChange={event=>setPantry(event.target.value)} placeholder="For example: rice, six eggs, carrots, chicken in the freezer" disabled={busy}/><label htmlFor="preferences">Anything you would like this week?</label><textarea id="preferences" maxLength={1000} rows={2} value={preferences} onChange={event=>setPreferences(event.target.value)} placeholder="For example: two vegetarian dinners, more Korean food, easy lunches" disabled={busy}/><label htmlFor="access-code">Your private site password</label><input id="access-code" type="password" autoComplete="off" minLength={12} maxLength={256} required value={sitePassword} onChange={event=>setSitePassword(event.target.value)} disabled={busy} aria-describedby="code-help"/><p id="code-help" className="shopping-note">Enter your site password to generate a plan. Your password is not saved in this browser.</p><button className="button" type="submit" disabled={busy||!ready}>{busy?"Planning your week…":"Generate a new weekly plan"}</button><p className="agent-message" role="status">{message}</p>{error&&<p className="agent-error" role="alert">{error}</p>}</form></section><section aria-labelledby="menu-title"><h2 id="menu-title">This week’s menu</h2><p>Cooking times are estimates of total active time each day. {plan ? "This is your AI-generated plan, saved in this browser." : "This is your starter plan."}</p>{plan&&<p className="budget-estimate">Estimated shopping total: <strong>NZ${plan.estimatedTotalNZD.toFixed(2)}</strong> / NZ$500. Estimates are not live supermarket prices.</p>}<div className="meal-grid">{meals.map(([day,breakfast,lunch,dinner,time])=><article className="meal-day" key={day}><div className="meal-day-heading"><h3>{day}</h3><span>{time} min</span></div><dl><dt>Breakfast</dt><dd>{breakfast}{plan&&<Recipe meal={plan.days.find(item=>item.day===day).breakfast}/>}</dd><dt>Lunch</dt><dd>{lunch}{plan&&<Recipe meal={plan.days.find(item=>item.day===day).lunch}/>}</dd><dt>Dinner</dt><dd>{dinner}{plan&&<Recipe meal={plan.days.find(item=>item.day===day).dinner}/>}</dd></dl></article>)}</div></section><section className="meal-shopping" id="shopping"><h2>One shopping list</h2><p>Approximate quantities include planned leftovers. Check your cupboards first. NZ$500 is your spending limit; this list is not a priced grocery quote.</p><div className="shopping-actions"><p aria-live="polite">{checked.filter(item=>Object.values(groceries).flat().includes(item)).length} of {total} items checked</p><button onClick={()=>setChecked([])} disabled={!ready||!checked.length}>Reset checklist</button><button onClick={()=>window.print()}>Print plan & list</button></div><p className="shopping-note">{storageError?'Your browser cannot save this checklist. Your checks work for this visit.':'Your checks are saved in this browser, on this device.'}</p><div className="shopping-grid">{Object.entries(groceries).map(([category,items])=><fieldset key={category}><legend>{category}</legend>{items.map(item=><label className={checked.includes(item)?'shopping-item is-checked':'shopping-item'} key={item}><input type="checkbox" checked={checked.includes(item)} disabled={!ready} onChange={()=>toggle(item)}/><span>{item}</span></label>)}</fieldset>)}</div></section><section className="closing"><h2>Cook once. Enjoy twice.</h2>{plan?<ul>{plan.prepNotes.map((note,index)=><li key={index}>{note}</li>)}</ul>:<p>Make six portions of Monday’s chicken and eight portions of Wednesday’s curry and Friday’s bolognese. Reserve the extras for the lunches in the plan.</p>}</section></main><footer><span>Joy’s cooking planner</span><a href="/">Back to my website</a></footer></>;
}

function Recipe({meal}) { return <details className="meal-recipe"><summary>Recipe for 4</summary><p>{meal.activeMinutes} min active cooking</p><h4>Ingredients</h4><ul>{meal.ingredients.map((item,index)=><li key={index}>{item}</li>)}</ul><h4>Steps</h4><ol>{meal.steps.map((step,index)=><li key={index}>{step}</li>)}</ol></details>; }
