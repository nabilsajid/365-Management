import { crud } from '@/lib/api/context';
import { accounts } from '@/lib/api/resources';

const handlers = crud.collection(accounts);

export const GET = handlers.GET;
export const POST = handlers.POST;
