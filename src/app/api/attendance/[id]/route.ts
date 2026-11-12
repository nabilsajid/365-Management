import { crud } from '@/lib/api/context';
import { attendance } from '@/lib/api/resources';

const handlers = crud.item(attendance);

export const GET = handlers.GET;
export const PATCH = handlers.PATCH;
export const DELETE = handlers.DELETE;
