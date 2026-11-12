import { crud } from '@/lib/api/context';
import { projects } from '@/lib/api/resources';

const handlers = crud.item(projects);

export const GET = handlers.GET;
export const PATCH = handlers.PATCH;
export const DELETE = handlers.DELETE;
