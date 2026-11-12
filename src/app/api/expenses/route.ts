import { crud } from '@/lib/api/context';
import { expenses } from '@/lib/api/resources';

const handlers = crud.collection(expenses);

export const GET = handlers.GET;
export const POST = handlers.POST;
