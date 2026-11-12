import { crud } from '@/lib/api/context';
import { equipmentNeeds } from '@/lib/api/resources';

const handlers = crud.item(equipmentNeeds);

export const GET = handlers.GET;
export const PATCH = handlers.PATCH;
export const DELETE = handlers.DELETE;
