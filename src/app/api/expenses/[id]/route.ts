import { crud } from '@/lib/api/context';
import { expenses } from '@/lib/api/resources';

const handlers = crud.item(expenses);

export const GET = handlers.GET;
export const PATCH = handlers.PATCH;
export const DELETE = handlers.DELETE;
