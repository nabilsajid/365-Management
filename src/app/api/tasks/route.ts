import { crud } from '@/lib/api/context';
import { tasks } from '@/lib/api/resources';

const handlers = crud.collection(tasks);

export const GET = handlers.GET;
export const POST = handlers.POST;
