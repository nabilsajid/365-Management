/**
 * What kind of record a form is for, from its endpoint: "/api/equipment" → "equipment",
 * "/api/projects/<id>/months" → "projects-months". Browsers remember what was typed per
 * field name, so naming each field after its kind keeps a client's name from being
 * suggested in the equipment form, and the other way round.
 */
export function formScope(endpoint: string): string {
  return (
    endpoint
      .replace(/^\/api\//, '')
      .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '')
      .replace(/[^a-z0-9]+/gi, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase() || 'form'
  );
}
