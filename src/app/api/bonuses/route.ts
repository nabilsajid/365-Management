import { crud } from '@/lib/api/context';
import { bonuses } from '@/lib/api/resources';

const handlers = crud.collection(bonuses);

export const GET = handlers.GET;
