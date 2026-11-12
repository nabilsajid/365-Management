import { crud } from '@/lib/api/context';
import { tasks } from '@/lib/api/resources';

const handlers = crud.item(tasks);

export const GET = handlers.GET;
export const PATCH = handlers.PATCH;
export const DELETE = handlers.DELETE;
