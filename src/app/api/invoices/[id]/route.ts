import { crud } from '@/lib/api/context';
import { invoices } from '@/lib/api/resources';

const handlers = crud.item(invoices);

export const GET = handlers.GET;
export const PATCH = handlers.PATCH;
export const DELETE = handlers.DELETE;
