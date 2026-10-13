import { decideOpportunity } from '../../../records';
export const runtime='nodejs';
export const maxDuration=15;
export async function POST(request,{params}) {
  const {id,action}=await params;
  return decideOpportunity(request,id,action);
}
