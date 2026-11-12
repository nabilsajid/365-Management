import { crud } from '@/lib/api/context';
import { equipment } from '@/lib/api/resources';

const handlers = crud.collection(equipment);

export const GET = handlers.GET;
export const POST = handlers.POST;
