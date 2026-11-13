import { after } from 'next/server';
import { crud } from '@/lib/api/context';
import { tasks } from '@/lib/api/resources';
import { dispatchPushes } from '@/lib/server/push';

const handlers = crud.item(tasks);

export const GET = handlers.GET;
export const DELETE = handlers.DELETE;

// Changing the assignee notifies the new person; the alert goes to their devices once the reply is sent.
export async function PATCH(request: Request, route: { params: Promise<{ id: string }> }): Promise<Response> {
  const response = await handlers.PATCH(request, route);
  if (response.ok) after(dispatchPushes);
  return response;
}
