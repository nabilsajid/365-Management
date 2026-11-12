import { crud } from '@/lib/api/context';
import { invoices } from '@/lib/api/resources';

const handlers = crud.collection(invoices);

export const GET = handlers.GET;
export const POST = handlers.POST;
