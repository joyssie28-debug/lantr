// Shared by the server and browser; contains no credentials or server imports.
export const DEFAULT_MEAL_SETTINGS = Object.freeze({budgetNZD:500,familySize:4,coverage:'all',cookingMinutes:45});
export function normalizeMealSettings(input={}) {
  const {budgetNZD=500,familySize=4,coverage='all',cookingMinutes=45}=input;
  const invalid=message=>{throw Object.assign(new Error(message),{status:400});};
  if(typeof budgetNZD!=='number'||!Number.isFinite(budgetNZD)||budgetNZD<1||budgetNZD>10000||Math.abs(budgetNZD*100-Math.round(budgetNZD*100))>0.000001)invalid('Enter a weekly budget from NZ$1 to NZ$10,000, with up to two decimal places.');
  if(!Number.isInteger(familySize)||familySize<1||familySize>20)invalid('Choose a family size from 1 to 20 people.');
  if(!['all','dinners'].includes(coverage))invalid('Choose dinners only or all meals.');
  if(!Number.isInteger(cookingMinutes)||cookingMinutes<5||cookingMinutes>240)invalid('Choose 5 to 240 minutes of active cooking per day.');
  return {budgetNZD,familySize,coverage,cookingMinutes};
}
export const mealSlots=coverage=>coverage==='dinners'?['dinner']:['breakfast','lunch','dinner'];
export function budgetSummary(total,budget) {
  const estimatedTotalNZD=Math.round((total+Number.EPSILON)*100)/100;
  return {estimatedTotalNZD,overBudget:estimatedTotalNZD>budget,overBudgetNZD:Math.max(0,Math.round((estimatedTotalNZD-budget)*100)/100)};
}
