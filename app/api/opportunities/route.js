import { proxyOpportunity } from './proxy';
export const runtime='nodejs';
export const maxDuration=15;
export async function POST(request){return proxyOpportunity(request,'start');}
