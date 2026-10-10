import { proxyOpportunity } from '../proxy';
export const runtime='nodejs';
export const maxDuration=15;
export async function GET(request,context){const {jobId}=await context.params;return proxyOpportunity(request,'progress',jobId);}
export async function DELETE(request,context){const {jobId}=await context.params;return proxyOpportunity(request,'cancel',jobId);}
