import { crud } from '@/lib/api/context';
import { equipment } from '@/lib/api/resources';

const handlers = crud.item(equipment);

export const GET = handlers.GET;
export const PATCH = handlers.PATCH;
export const DELETE = handlers.DELETE;
