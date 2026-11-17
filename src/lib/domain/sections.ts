/**
 * Features a company can switch off in Settings → Company. Core pages always stay.
 * Page features hide their menu item; "points" hides the points, attendance,
 * bonuses and rules tabs of Employees, keeping the team list.
 */
export const OPTIONAL_SECTIONS = ['/calendar', '/leave', '/logistics', 'points'] as const;
export type OptionalSection = (typeof OPTIONAL_SECTIONS)[number];

export const SECTION_LABEL: Record<OptionalSection, string> = {
  '/calendar': 'Calendar',
  '/leave': 'Leave',
  '/logistics': 'Equipment & Costs',
  points: 'Points & rewards',
};

/** What each feature is, and the data removed if it is switched off with its data. */
export const SECTION_INFO: Record<OptionalSection, { about: string; data: string | null }> = {
  '/calendar': { about: 'A month view of due dates, shoots and leave.', data: null },
  '/leave': { about: 'Asking for leave, approving it, and monthly leave records.', data: 'every leave request' },
  '/logistics': { about: 'The equipment register, checkouts, needed items, fixed costs and travel.', data: 'the equipment register, checkouts and needed items' },
  points: { about: 'Points, attendance, bonuses and point rules for the team.', data: 'all points, attendance records and bonuses' },
};

/** The hidden sections stored in a company's settings, ignoring anything unknown. */
export function hiddenSections(settings: unknown): OptionalSection[] {
  const list = (settings as { hidden_sections?: unknown } | null)?.hidden_sections;
  // "/employees" was the old name for switching off points.
  return Array.isArray(list)
    ? [...new Set(list.map((item) => (item === '/employees' ? 'points' : item)))].filter((item): item is OptionalSection =>
        (OPTIONAL_SECTIONS as readonly string[]).includes(item),
      )
    : [];
}

export interface ReminderSettings {
  due_tomorrow: boolean;
  missed: boolean;
  invoices: boolean;
  equipment_late: boolean;
  /** Also send urgent alerts by email / WhatsApp, when the server is set up for it. */
  email: boolean;
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
    email: flag('email'),
    shoot_days: Number.isInteger(days) && days >= 0 && days <= 14 ? days : 2,
  };
}
