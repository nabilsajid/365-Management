import { crud } from '@/lib/api/context';
import { accounts } from '@/lib/api/resources';

const handlers = crud.item(accounts);

export const GET = handlers.GET;
export const PATCH = handlers.PATCH;
export const DELETE = handlers.DELETE;
