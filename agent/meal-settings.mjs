// Shared by the server and browser; contains no credentials or server imports.
export const DIETARY_OPTIONS=[{value:'vegetarian',label:'Vegetarian'},{value:'vegan',label:'Vegan'},{value:'gluten-free',label:'Gluten-free'},{value:'dairy-free',label:'Dairy-free'}];
export const ALLERGY_OPTIONS=['milk','eggs','peanuts','tree nuts','soy','wheat','fish','shellfish','sesame'];
export const DEFAULT_MEAL_SETTINGS = Object.freeze({budgetNZD:500,familySize:4,coverage:'all',cookingMinutes:45,dietaryRequirements:[],allergies:[],maxPrepMinutes:null});
export function normalizeMealSettings(input={}) {
  const {budgetNZD=500,familySize=4,coverage='all',cookingMinutes=45,dietaryRequirements=[],allergies=[],maxPrepMinutes=null}=input;
  const invalid=message=>{throw Object.assign(new Error(message),{status:400});};
  if(typeof budgetNZD!=='number'||!Number.isFinite(budgetNZD)||budgetNZD<1||budgetNZD>10000||Math.abs(budgetNZD*100-Math.round(budgetNZD*100))>0.000001)invalid('Enter a weekly budget from NZ$1 to NZ$10,000, with up to two decimal places.');
  if(!Number.isInteger(familySize)||familySize<1||familySize>20)invalid('Choose a family size from 1 to 20 people.');
  if(!['all','dinners'].includes(coverage))invalid('Choose dinners only or all meals.');
  if(!Number.isInteger(cookingMinutes)||cookingMinutes<5||cookingMinutes>240)invalid('Choose 5 to 240 minutes of active cooking per day.');
  if(maxPrepMinutes!==null&&(!Number.isInteger(maxPrepMinutes)||maxPrepMinutes<5||maxPrepMinutes>240))invalid('Choose a preparation limit from 5 to 240 minutes per meal.');
  if(!Array.isArray(dietaryRequirements)||dietaryRequirements.length>4||dietaryRequirements.some(value=>!DIETARY_OPTIONS.some(option=>option.value===value)))invalid('Choose valid dietary requirements.');
  if(!Array.isArray(allergies)||allergies.length>20||allergies.some(value=>typeof value!=='string'||!value.trim()||value.length>80||/[\r\n]/.test(value)))invalid('Enter up to 20 allergies, each up to 80 characters.');
  return {budgetNZD,familySize,coverage,cookingMinutes,maxPrepMinutes,dietaryRequirements:[...new Set(dietaryRequirements)].sort(),allergies:[...new Set(allergies.map(value=>value.trim().toLowerCase()))].sort()};
}
export const mealSlots=coverage=>coverage==='dinners'?['dinner']:['breakfast','lunch','dinner'];
export function budgetSummary(total,budget) {
  const estimatedTotalNZD=Math.round((total+Number.EPSILON)*100)/100;
  return {estimatedTotalNZD,overBudget:estimatedTotalNZD>budget,overBudgetNZD:Math.max(0,Math.round((estimatedTotalNZD-budget)*100)/100)};
}
