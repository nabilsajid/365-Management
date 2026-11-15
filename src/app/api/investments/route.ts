import { crud } from '@/lib/api/context';
import { investments } from '@/lib/api/resources';

const handlers = crud.collection(investments);

export const GET = handlers.GET;
export const POST = handlers.POST;
