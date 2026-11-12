import { crud } from '@/lib/api/context';
import { submissions } from '@/lib/api/resources';

const handlers = crud.item(submissions);

export const GET = handlers.GET;
export const PATCH = handlers.PATCH;
export const DELETE = handlers.DELETE;
