import { proxyOpportunity } from './proxy';
import { listOpportunities } from './records';
export const runtime='nodejs';
export const maxDuration=15;
export async function POST(request){return proxyOpportunity(request,'start');}
export async function GET(request){return listOpportunities(request);}
