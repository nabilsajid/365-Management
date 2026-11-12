import { crud } from '@/lib/api/context';
import { fixedExpenses } from '@/lib/api/resources';

const handlers = crud.item(fixedExpenses);

export const GET = handlers.GET;
export const PATCH = handlers.PATCH;
export const DELETE = handlers.DELETE;
