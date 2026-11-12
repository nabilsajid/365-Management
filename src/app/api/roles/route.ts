import { crud } from '@/lib/api/context';
import { roles } from '@/lib/api/resources';

const handlers = crud.collection(roles);

export const GET = handlers.GET;
export const POST = handlers.POST;
