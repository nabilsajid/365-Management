import { readInvoiceOptions, type InvoiceOptions } from '@/lib/domain/invoice-options';

export interface InvoiceSheetData {
  orgName: string;
  /** The company's uploaded logo; the built-in one is used when there is none. */
  logo?: string | null;
  /** Address, phone, email and website from Settings → Company. */
  orgLines?: string[];
  invoiceNumber: string;
  issueDate: string;
  dueDate: string | null;
  status: string;
  amount: number;
  paid: number;
  notes: string | null;
  clientName: string;
  clientContact: string | null;
  clientEmail: string | null;
  clientPhone: string | null;
  projectName: string | null;
  /** Use the built-in 365 Frames logo when no logo is uploaded (only for the first company). */
  builtInLogo?: boolean;
  /** The company's currency code, e.g. BDT. */
  currency?: string;
  /** The signature image from the invoice settings. */
  signature?: string | null;
  /** The company's phone and email from Settings → Company, used when the invoice settings give none. */
  orgPhone?: string | null;
  orgEmail?: string | null;
  /** Itemised lines (what, how many, price each); without them the invoice is one line. */
  lines?: InvoiceLine[] | null;
}

export interface InvoiceLine {
  description: string;
  quantity: number;
  unit_price: number;
}

/** The lines stored on an invoice, ignoring anything malformed. */
export function readInvoiceLines(value: unknown): InvoiceLine[] | null {
  if (!Array.isArray(value)) return null;
  const lines = value
    .map((line) => line as Partial<InvoiceLine>)
    .filter((line) => typeof line.description === 'string' && Number.isFinite(Number(line.quantity)) && Number.isFinite(Number(line.unit_price)))
    .map((line) => ({ description: line.description!, quantity: Number(line.quantity), unit_price: Number(line.unit_price) }));
  return lines.length > 0 ? lines : null;
}

const formatDate = (value: string | null) => {
  if (!value) return '';
  const [year, month, day] = value.slice(0, 10).split('-');
  return `${day}/${month}/${year}`;
};

/**
 * An invoice in the company's own style: a soft wave at the top with the logo,
 * a large INVOICE title, who it is for, the date and number, the items, the total,
 * how to pay, the signature, a thank-you line and phone and email at the bottom.
 * It reads on screen and prints cleanly (Save as PDF). Only the parts switched on show.
 */
export function InvoiceSheet({ data, options = readInvoiceOptions({}) }: { data: InvoiceSheetData; options?: InvoiceOptions }) {
  const { show } = options;
  const text = options.text ?? ({} as InvoiceOptions['text']);
  const currency = data.currency ?? 'BDT';
  const amount = (value: number) => `${Number(value).toLocaleString('en-US', { maximumFractionDigits: 2 })} ${currency}`;
  const outstanding = data.status === 'void' ? 0 : Math.max(0, data.amount - data.paid);
  const statusText = data.status === 'draft' ? 'Draft' : data.status === 'void' ? 'Cancelled' : outstanding <= 0 ? 'Paid' : data.paid > 0 ? 'Partly paid' : 'Unpaid';
  const clientLines = [
    text.client_line || null,
    show.project && data.projectName ? data.projectName : null,
    show.client_contact ? data.clientContact : null,
    show.client_email ? data.clientEmail : null,
    show.client_phone ? data.clientPhone : null,
  ].filter((line): line is string => Boolean(line));
  const lines = data.lines ?? [
    { description: show.project && data.projectName ? `Production: ${data.projectName}` : 'Production services', quantity: 1, unit_price: data.amount },
  ];
  const itemised = lines.some((line) => line.quantity !== 1);
  const phone = text.phone || data.orgPhone || '';
  const email = text.email || data.orgEmail || '';

  return (
    <article className="inv">
      <svg className="inv-wave" viewBox="0 0 800 160" preserveAspectRatio="none" aria-hidden>
        <path d="M0,0 H800 V158 C745,150 700,62 560,48 C420,36 300,58 0,44 Z" fill="#d9d9d9" />
      </svg>
      <div className="inv-head">
        {show.logo && (data.logo || data.builtInLogo) ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={data.logo ?? '/logo-dark.png'} alt={data.orgName} className="inv-logo" />
        ) : show.logo ? (
          <p className="inv-logo-text">{data.orgName}</p>
        ) : (
          <span />
        )}
        <span className="inv-head-rule" aria-hidden />
      </div>

      <div className="inv-body">
        <h1 className="inv-title">INVOICE</h1>

        <div className="inv-parties">
          <div>
            {show.client_name || clientLines.length > 0 ? <p className="inv-label">To</p> : null}
            {show.client_name ? <p className="inv-client">{data.clientName}</p> : null}
            {clientLines.map((line) => (
              <p key={line} className="inv-client-line">
                {line}
              </p>
            ))}
          </div>
          <div className="inv-meta">
            {show.issue_date ? <p>Date : {formatDate(data.issueDate)}</p> : null}
            {show.invoice_number ? <p className="inv-number">Invoice no : {data.invoiceNumber}</p> : null}
            {show.due_date && data.dueDate ? <p>Due : {formatDate(data.dueDate)}</p> : null}
            {show.status ? <p>Status : {statusText}</p> : null}
            {show.company_name ? <p className="inv-from">{data.orgName}</p> : null}
            {show.company_name && data.orgLines?.length ? <p className="inv-from-lines">{data.orgLines.join(' · ')}</p> : null}
          </div>
        </div>

        <table className="inv-table">
          <thead>
            <tr>
              <th className="inv-no">NO</th>
              <th>DESCRIPTION</th>
              {itemised ? (
                <>
                  <th className="inv-num">QTY</th>
                  <th className="inv-num">RATE</th>
                </>
              ) : null}
              <th className="inv-num">{itemised ? 'AMOUNT' : ''}</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line, index) => (
              <tr key={index}>
                <td className="inv-no">{index + 1}</td>
                <td className="inv-desc">{line.description}</td>
                {itemised ? (
                  <>
                    <td className="inv-num">{line.quantity}</td>
                    <td className="inv-num">{amount(line.unit_price)}</td>
                  </>
                ) : null}
                <td className="inv-num">{amount(line.quantity * line.unit_price)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="inv-totals">
          <p>
            <span>Total :</span>
            <strong>{amount(data.status === 'void' ? 0 : data.amount)}</strong>
          </p>
          {show.paid && data.paid > 0 ? (
            <>
              <p className="inv-small">
                <span>Paid so far :</span>
                <span>{amount(data.paid)}</span>
              </p>
              <p>
                <span>Amount due :</span>
                <strong>{amount(outstanding)}</strong>
              </p>
            </>
          ) : null}
        </div>

        {show.notes && data.notes ? <p className="inv-note">{data.notes}</p> : null}

        <div className="inv-bottom">
          <div>
            {show.payment && text.payment_details ? (
              <>
                <p className="inv-pay-title">Payment Method :</p>
                <p className="inv-pay">{text.payment_details}</p>
              </>
            ) : null}
            {show.thank_you && text.thank_you ? <p className="inv-thanks">{text.thank_you}</p> : null}
          </div>
          {show.signature && (data.signature || text.signature_name) ? (
            <div className="inv-sign">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {data.signature ? <img src={data.signature} alt="" /> : <span className="inv-sign-space" />}
              {text.signature_name ? <p className="inv-sign-name">{text.signature_name}</p> : null}
              {text.signature_title ? <p className="inv-sign-title">{text.signature_title}</p> : null}
            </div>
          ) : null}
        </div>

        {text.footer ? <p className="inv-footer">{text.footer}</p> : null}

        {show.contacts && (phone || email) ? (
          <div className="inv-contacts">
            {phone ? (
              <span className="inv-pill">
                <svg viewBox="0 0 24 24" aria-hidden>
                  <path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1z" />
                </svg>
                <span>
                  <strong>Phone</strong>
                  {phone}
                </span>
              </span>
            ) : null}
            {email ? (
              <span className="inv-pill">
                <svg viewBox="0 0 24 24" aria-hidden>
                  <path d="M3 5h18a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zm0 2.3V17h18V7.3l-9 6.1zM4.3 7 12 12.2 19.7 7z" />
                </svg>
                <span>
                  <strong>Mail</strong>
                  {email}
                </span>
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
    </article>
  );
}

/** Whether this is the first company in the app (365 Frames), which has a built-in logo. */
export async function isFirstCompany(db: unknown, orgId: string): Promise<boolean> {
  try {
    type Chain = {
      select: (columns: string) => Chain;
      order: (column: string, options: { ascending: boolean }) => Chain;
      limit: (count: number) => Chain;
      maybeSingle: () => PromiseLike<{ data: unknown }>;
    };
    const first = await (db as { from: (table: string) => Chain })
      .from('organizations')
      .select('id')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    return (first.data as { id?: string } | null)?.id === orgId;
  } catch {
    return false;
  }
}

type Loader = {
  from: (table: string) => {
    select: (columns: string) => { eq: (column: string, value: string) => { maybeSingle: () => PromiseLike<{ data: unknown }> } };
  };
};

/** Gathers what the sheet shows, with whichever client (signed in or service) is allowed to read it. */
export async function loadInvoiceSheet(db: Loader, invoice: Record<string, unknown>): Promise<{ data: InvoiceSheetData; options: InvoiceOptions }> {
  const [org, client, project, balance, logo, signature] = await Promise.all([
    db.from('organizations').select('*').eq('id', invoice.org_id as string).maybeSingle(),
    db.from('clients').select('name, contact_name, email, phone').eq('id', invoice.client_id as string).maybeSingle(),
    invoice.project_id ? db.from('projects').select('name').eq('id', invoice.project_id as string).maybeSingle() : Promise.resolve({ data: null }),
    db.from('invoice_balances').select('paid').eq('invoice_id', invoice.id as string).maybeSingle(),
    // The company's own logo from Settings → Company, if it has one.
    db.from('org_logos').select('data').eq('org_id', invoice.org_id as string).maybeSingle(),
    db.from('org_signatures').select('data').eq('org_id', invoice.org_id as string).maybeSingle(),
  ]);
  const c = client.data as { name: string; contact_name: string | null; email: string | null; phone: string | null } | null;
  const orgRow = org.data as
    | { name: string; currency?: string; invoice_options?: unknown; contact_address?: string | null; contact_phone?: string | null; contact_email?: string | null; website?: string | null }
    | null;
  const data: InvoiceSheetData = {
    orgName: orgRow?.name ?? '',
    logo: (logo.data as { data?: string } | null)?.data ?? null,
    signature: (signature.data as { data?: string } | null)?.data ?? null,
    builtInLogo: await isFirstCompany(db, invoice.org_id as string),
    currency: orgRow?.currency ?? 'BDT',
    orgPhone: orgRow?.contact_phone ?? null,
    orgEmail: orgRow?.contact_email ?? null,
    orgLines: [orgRow?.contact_address, orgRow?.website].filter((line): line is string => Boolean(line)),
    invoiceNumber: invoice.invoice_number as string,
    issueDate: invoice.issue_date as string,
    dueDate: (invoice.due_date as string | null) ?? null,
    status: invoice.status as string,
    amount: Number(invoice.amount),
    paid: Number((balance.data as { paid: number } | null)?.paid ?? 0),
    notes: (invoice.notes as string | null) ?? null,
    lines: (() => {
      // If the amount was changed after the lines were made, the difference shows as an adjustment.
      const lines = readInvoiceLines(invoice.lines);
      if (!lines) return null;
      const difference = Math.round((Number(invoice.amount) - lines.reduce((sum, line) => sum + line.quantity * line.unit_price, 0)) * 100) / 100;
      return difference === 0 ? lines : [...lines, { description: 'Adjustment', quantity: 1, unit_price: difference }];
    })(),
    clientName: c?.name ?? '—',
    clientContact: c?.contact_name ?? null,
    clientEmail: c?.email ?? null,
    clientPhone: c?.phone ?? null,
    projectName: (project.data as { name: string } | null)?.name ?? null,
  };
  return { data, options: readInvoiceOptions(orgRow?.invoice_options) };
}
