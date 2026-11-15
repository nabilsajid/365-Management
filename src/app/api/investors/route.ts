import { crud } from '@/lib/api/context';
import { investors } from '@/lib/api/resources';

const handlers = crud.collection(investors);

export const GET = handlers.GET;
export const POST = handlers.POST;
