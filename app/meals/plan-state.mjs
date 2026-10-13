import {normalizeMealSettings,mealSlots,budgetSummary} from '../../agent/meal-settings.mjs';
const days=['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
export function validPlan(plan) {
  try {
    const settings=normalizeMealSettings(plan);
    if(!Array.isArray(plan.days)||plan.days.length!==7||!Array.isArray(plan.shopping)||!plan.shopping.length||!Array.isArray(plan.prepNotes)||!plan.prepNotes.every(item=>typeof item==='string'))return false;
    for(let i=0;i<7;i++){
      const day=plan.days[i];if(day.day!==days[i])return false;
      if(settings.coverage==='dinners'&&(day.breakfast||day.lunch))return false;
      let minutes=0;
      for(const slot of mealSlots(settings.coverage)){
        const meal=day[slot];if(!meal||typeof meal.title!=='string'||!Number.isInteger(meal.activeMinutes)||meal.activeMinutes<0||!Array.isArray(meal.ingredients)||!meal.ingredients.length||!meal.ingredients.every(item=>typeof item==='string')||!Array.isArray(meal.steps)||!meal.steps.length||!meal.steps.every(item=>typeof item==='string'))return false;
        minutes+=meal.activeMinutes;
      }
      if(minutes>settings.cookingMinutes)return false;
    }
    let total=0;
    for(const group of plan.shopping){if(typeof group.category!=='string'||!Array.isArray(group.items)||!group.items.length)return false;for(const item of group.items){if(typeof item.name!=='string'||typeof item.quantity!=='string'||!Number.isFinite(item.estimatedNZD)||item.estimatedNZD<0)return false;total+=item.estimatedNZD;}}
    return Number.isFinite(plan.estimatedTotalNZD)&&Math.abs(budgetSummary(total,settings.budgetNZD).estimatedTotalNZD-plan.estimatedTotalNZD)<0.02;
  }catch{return false;}
}
