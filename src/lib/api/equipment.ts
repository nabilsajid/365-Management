/** Admins and roles that edit equipment manage checkouts. */
export function managesEquipment(ctx: { profile: { access_role: string }; editSegments?: ReadonlySet<string>; segments: ReadonlySet<string> }): boolean {
  return ctx.profile.access_role === 'admin' || (ctx.editSegments ?? ctx.segments).has('equipment');
}
