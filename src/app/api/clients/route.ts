import { crud } from '@/lib/api/context';
import { clients } from '@/lib/api/resources';

const handlers = crud.collection(clients);

export const GET = handlers.GET;
export const POST = handlers.POST;
