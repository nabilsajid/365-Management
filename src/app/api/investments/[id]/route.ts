import { crud } from '@/lib/api/context';
import { investments } from '@/lib/api/resources';

const handlers = crud.item(investments);

export const GET = handlers.GET;
export const PATCH = handlers.PATCH;
export const DELETE = handlers.DELETE;
