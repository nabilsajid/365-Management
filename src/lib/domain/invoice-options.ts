// How invoices look. Chosen by an admin and used on the printable page, the
// PDF and the link sent to the client. Anything not switched off is shown.

export const INVOICE_PARTS = [
  { key: 'logo', label: 'Company logo' },
  { key: 'company_name', label: 'Company name' },
  { key: 'invoice_number', label: 'Invoice number' },
  { key: 'issue_date', label: 'Date' },
  { key: 'due_date', label: 'Due date' },
  { key: 'status', label: 'Payment status' },
  { key: 'client_name', label: 'Client name' },
  { key: 'client_contact', label: 'Client contact person' },
  { key: 'client_email', label: 'Client email' },
  { key: 'client_phone', label: 'Client phone' },
  { key: 'project', label: 'Project name' },
  { key: 'paid', label: 'Amount paid so far' },
  { key: 'notes', label: 'Invoice note' },
  { key: 'payment', label: 'Payment method' },
  { key: 'signature', label: 'Signature' },
  { key: 'thank_you', label: 'Thank-you line' },
  { key: 'contacts', label: 'Phone and email at the bottom' },
] as const;

export type InvoicePart = (typeof INVOICE_PARTS)[number]['key'];

/** The words an admin writes once for every invoice. */
export const INVOICE_TEXTS = [
  { key: 'client_line', label: 'Line under the client name', placeholder: 'For example: Cambridge O Level English Language Teacher', rows: 1 },
  { key: 'payment_details', label: 'Payment method', placeholder: 'Account Number : …\nAccount Name : …\nBranch Name : …\nBank Name : …\nRouting Number : …', rows: 5 },
  { key: 'signature_name', label: 'Signed by (name)', placeholder: 'Nabil Azmal Sajid', rows: 1 },
  { key: 'signature_title', label: 'Signed by (designation)', placeholder: 'Head of Operations', rows: 1 },
  { key: 'thank_you', label: 'Thank-you line', placeholder: 'THANK YOU FOR BUSINESS!', rows: 1 },
  { key: 'phone', label: 'Phone (bottom of the invoice)', placeholder: '01537556495', rows: 1 },
  { key: 'email', label: 'Email (bottom of the invoice)', placeholder: 'official@365frames.com', rows: 1 },
  { key: 'footer', label: 'Note on every invoice (optional)', placeholder: 'Anything else to print at the bottom', rows: 2 },
] as const;

export type InvoiceText = (typeof INVOICE_TEXTS)[number]['key'];

export interface InvoiceOptions {
  show: Record<InvoicePart, boolean>;
  text: Record<InvoiceText, string>;
  /** Kept for older code: the same as text.footer. */
  footer: string;
}

/** Parts that start switched off until an admin turns them on. */
const OFF_BY_DEFAULT: InvoicePart[] = ['due_date', 'status', 'company_name'];

export function readInvoiceOptions(value: unknown): InvoiceOptions {
  const raw = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const show = {} as Record<InvoicePart, boolean>;
  for (const part of INVOICE_PARTS) show[part.key] = typeof raw[part.key] === 'boolean' ? (raw[part.key] as boolean) : !OFF_BY_DEFAULT.includes(part.key);
  const text = {} as Record<InvoiceText, string>;
  for (const item of INVOICE_TEXTS) text[item.key] = typeof raw[item.key] === 'string' ? (raw[item.key] as string).slice(0, 1000) : '';
  return { show, text, footer: text.footer };
}

/** The stored form: every part as true or false, plus the texts. */
export function storeInvoiceOptions(options: InvoiceOptions): Record<string, boolean | string> {
  const stored: Record<string, boolean | string> = {};
  for (const part of INVOICE_PARTS) stored[part.key] = options.show[part.key] !== false;
  for (const item of INVOICE_TEXTS) stored[item.key] = (options.text?.[item.key] ?? '').slice(0, 1000);
  return stored;
}
