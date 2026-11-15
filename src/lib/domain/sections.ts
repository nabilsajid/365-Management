/** Menu sections a company can switch off in Settings → Company. Core pages always stay. */
export const OPTIONAL_SECTIONS = ['/calendar', '/leave', '/logistics', '/employees'] as const;
export type OptionalSection = (typeof OPTIONAL_SECTIONS)[number];

export const SECTION_LABEL: Record<OptionalSection, string> = {
  '/calendar': 'Calendar',
  '/leave': 'Leave',
  '/logistics': 'Equipment & Costs',
  '/employees': 'Employees & Rewards',
};

/** The hidden sections stored in a company's settings, ignoring anything unknown. */
export function hiddenSections(settings: unknown): OptionalSection[] {
  const list = (settings as { hidden_sections?: unknown } | null)?.hidden_sections;
  return Array.isArray(list) ? list.filter((item): item is OptionalSection => (OPTIONAL_SECTIONS as readonly string[]).includes(item)) : [];
}

export interface ReminderSettings {
  due_tomorrow: boolean;
  missed: boolean;
  invoices: boolean;
  equipment_late: boolean;
  shoot_days: number;
}

/** The daily reminders a company wants; anything not set is on, shoots two days ahead. */
export function reminderSettings(settings: unknown): ReminderSettings {
  const raw = ((settings as { reminders?: Record<string, unknown> } | null)?.reminders ?? {}) as Record<string, unknown>;
  const flag = (key: string) => (typeof raw[key] === 'boolean' ? (raw[key] as boolean) : true);
  const days = Number(raw.shoot_days);
  return {
    due_tomorrow: flag('due_tomorrow'),
    missed: flag('missed'),
    invoices: flag('invoices'),
    equipment_late: flag('equipment_late'),
    shoot_days: Number.isInteger(days) && days >= 0 && days <= 14 ? days : 2,
  };
}
