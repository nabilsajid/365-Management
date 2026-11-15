import { crud } from '@/lib/api/context';
import { investors } from '@/lib/api/resources';

const handlers = crud.item(investors);

export const GET = handlers.GET;
export const PATCH = handlers.PATCH;
export const DELETE = handlers.DELETE;
