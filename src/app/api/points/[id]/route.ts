import { crud } from '@/lib/api/context';
import { pointEntries } from '@/lib/api/resources';

const handlers = crud.item(pointEntries);

export const GET = handlers.GET;
export const PATCH = handlers.PATCH;
export const DELETE = handlers.DELETE;
