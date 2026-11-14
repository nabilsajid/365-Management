// Which parts an invoice shows. Chosen by an admin and used on the printable
// page, the PDF and the link sent to the client. Anything not switched off is shown.

export const INVOICE_PARTS = [
  { key: 'logo', label: 'Company logo' },
  { key: 'company_name', label: 'Company name' },
  { key: 'invoice_number', label: 'Invoice number' },
  { key: 'issue_date', label: 'Issue date' },
  { key: 'due_date', label: 'Due date' },
  { key: 'status', label: 'Payment status' },
  { key: 'client_name', label: 'Client name' },
  { key: 'client_contact', label: 'Client contact person' },
  { key: 'client_email', label: 'Client email' },
  { key: 'client_phone', label: 'Client phone' },
  { key: 'project', label: 'Project name' },
  { key: 'paid', label: 'Amount paid so far' },
  { key: 'notes', label: 'Invoice notes' },
] as const;

export type InvoicePart = (typeof INVOICE_PARTS)[number]['key'];

export interface InvoiceOptions {
  show: Record<InvoicePart, boolean>;
  /** Printed at the bottom, for example payment details or a thank-you line. */
  footer: string;
}

export function readInvoiceOptions(value: unknown): InvoiceOptions {
  const raw = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const show = {} as Record<InvoicePart, boolean>;
  for (const part of INVOICE_PARTS) show[part.key] = raw[part.key] !== false;
  const footer = typeof raw.footer === 'string' ? raw.footer.slice(0, 1000) : '';
  return { show, footer };
}

/** The stored form: every part as true or false, plus the footer. */
export function storeInvoiceOptions(options: InvoiceOptions): Record<string, boolean | string> {
  const stored: Record<string, boolean | string> = {};
  for (const part of INVOICE_PARTS) stored[part.key] = options.show[part.key] !== false;
  stored.footer = options.footer.slice(0, 1000);
  return stored;
}
