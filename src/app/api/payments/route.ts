import { crud } from '@/lib/api/context';
import { payments } from '@/lib/api/resources';

const handlers = crud.collection(payments);

export const GET = handlers.GET;
export const POST = handlers.POST;
