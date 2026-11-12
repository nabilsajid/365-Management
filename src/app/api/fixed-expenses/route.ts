import { crud } from '@/lib/api/context';
import { fixedExpenses } from '@/lib/api/resources';

const handlers = crud.collection(fixedExpenses);

export const GET = handlers.GET;
export const POST = handlers.POST;
