import { crud } from '@/lib/api/context';
import { violationTypes } from '@/lib/api/resources';

const handlers = crud.collection(violationTypes);

export const GET = handlers.GET;
export const POST = handlers.POST;
