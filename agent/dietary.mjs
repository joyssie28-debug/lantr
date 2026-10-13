// Catch obvious ingredient conflicts in addition to the generator's instructions.
// This is not a substitute for reading product labels or checking cross-contact.
const patterns={
 milk:/\b(?:milk|butter|cream|cheese|yoghurt|yogurt|whey|casein|ghee)\b/i,
 eggs:/\b(?:eggs?|mayonnaise|mayo|albumen)\b/i,
 peanuts:/\bpeanuts?\b/i,
 'tree nuts':/\b(?:almonds?|cashews?|walnuts?|pecans?|pistachios?|hazelnuts?|macadamias?|brazil nuts?)\b/i,
 soy:/\b(?:soy|soya|tofu|tempeh|edamame|miso)\b/i,
 wheat:/\b(?:wheat|bulgur|couscous|semolina|spelt|seitan)\b/i,
 fish:/\b(?:fish|salmon|tuna|sardines?|anchov\w*|cod|haddock|trout|hoki)\b/i,
 shellfish:/\b(?:shellfish|prawns?|shrimp|crab|lobster|mussels?|oysters?|scallops?|clams?)\b/i,
 sesame:/\b(?:sesame|tahini)\b/i,
 meat:/\b(?:chicken|beef|pork|lamb|bacon|ham|turkey|duck|venison|gelatin|gelatine)\b/i,
 gluten:/\b(?:wheat|barley|rye|bulgur|couscous|semolina|spelt|seitan|bread|pasta|flour|soy sauce)\b/i,
};
function cleaned(value){return value.toLowerCase()
 .replace(/\b(?:gluten[- ]free|wheat[- ]free)\s+(?:bread|pasta|flour|soy sauce|wraps?|noodles?)\b/g,'alternative')
 .replace(/\b(?:soy[- ]free|peanut[- ]free|egg[- ]free|nut[- ]free|dairy[- ]free|milk[- ]free)\b/g,'alternative')
 .replace(/\b(?:oat|rice|almond|coconut|soy|soya|cashew)\s+(?:milk|cream|yoghurt|yogurt)\b/g,match=>match.replace(/milk|cream|yoghurt|yogurt/g,'drink'))
 .replace(/\b(?:vegan|plant[- ]based|dairy[- ]free)\s+(?:butter|cream|cheese|yoghurt|yogurt|milk|chicken|beef|pork|bacon|ham|mayonnaise|mayo)\b/g,'alternative');}
export function checkDietaryIngredients(plan,settings){
 const constraints=[...settings.allergies];
 if(settings.dietaryRequirements.includes('vegetarian')||settings.dietaryRequirements.includes('vegan'))constraints.push('meat','fish','shellfish');
 if(settings.dietaryRequirements.includes('vegan'))constraints.push('milk','eggs','honey');
 if(settings.dietaryRequirements.includes('dairy-free'))constraints.push('milk');
 if(settings.dietaryRequirements.includes('gluten-free'))constraints.push('gluten');
 const items=[...plan.days.flatMap(day=>['breakfast','lunch','dinner'].flatMap(slot=>day[slot]?.ingredients||[])),...plan.shopping.flatMap(group=>group.items.map(item=>item.name))];
 for(const requirement of new Set(constraints)){
  const pattern=patterns[requirement]||new RegExp('\\b'+requirement.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\b','i');
  if(items.some(item=>pattern.test(cleaned(item))))return {requirement};
 }
 return null;
}
