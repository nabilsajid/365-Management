import { after } from 'next/server';
import { crud } from '@/lib/api/context';
import { tasks } from '@/lib/api/resources';
import { dispatchPushes } from '@/lib/server/push';

const handlers = crud.collection(tasks);

export const GET = handlers.GET;

// Giving someone a deliverable notifies them; the alert goes to their devices once the reply is sent.
export async function POST(request: Request): Promise<Response> {
  const response = await handlers.POST(request);
  if (response.ok) after(dispatchPushes);
  return response;
}
