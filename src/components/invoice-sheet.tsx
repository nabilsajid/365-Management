import { readInvoiceOptions, type InvoiceOptions } from '@/lib/domain/invoice-options';
import { money } from '@/lib/format';

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

/** An invoice laid out to read on screen and print cleanly (Save as PDF). Shows only the parts switched on. */
export function InvoiceSheet({ data, options = readInvoiceOptions({}) }: { data: InvoiceSheetData; options?: InvoiceOptions }) {
  const { show } = options;
  const outstanding = data.status === 'void' ? 0 : Math.max(0, data.amount - data.paid);
  const statusText = data.status === 'void' ? 'Cancelled' : outstanding <= 0 ? 'Paid' : data.paid > 0 ? 'Partly paid' : 'Unpaid';
  const clientLines = [show.client_contact && data.clientContact, show.client_email && data.clientEmail, show.client_phone && data.clientPhone].filter(
    (line): line is string => Boolean(line),
  );
  const facts: [string, string][] = [];
  if (show.issue_date) facts.push(['Issued', data.issueDate]);
  if (show.due_date) facts.push(['Due', data.dueDate ?? 'On receipt']);
  if (show.status) facts.push(['Status', statusText]);

  return (
    <article className="invoice-sheet">
      <div className="invoice-top">
        <div className="invoice-brand">
          {show.logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={data.logo ?? '/logo-dark.png'} alt={data.orgName} width={161} height={48} className="invoice-logo" style={{ objectFit: 'contain', objectPosition: 'left' }} />
          ) : null}
          {show.company_name ? <p className="invoice-muted">{data.orgName}</p> : null}
          {show.company_name && data.orgLines && data.orgLines.length > 0 ? (
            <p className="invoice-muted" style={{ margin: 0, fontSize: '0.8rem' }}>
              {data.orgLines.join(' · ')}
            </p>
          ) : null}
          <h1>{show.invoice_number ? `Invoice ${data.invoiceNumber}` : 'Invoice'}</h1>
        </div>
        {facts.length > 0 ? (
          <dl className="invoice-facts">
            {facts.map(([name, value]) => (
              <div key={name}>
                <dt>{name}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        ) : null}
      </div>
      {show.client_name || clientLines.length > 0 ? (
        <div>
          <p className="invoice-muted">Bill to</p>
          {show.client_name ? <p style={{ margin: 0, fontWeight: 600 }}>{data.clientName}</p> : null}
          {clientLines.map((line) => (
            <p key={line} style={{ margin: 0 }}>
              {line}
            </p>
          ))}
        </div>
      ) : null}
      <table>
        <thead>
          <tr>
            <th>Description</th>
            {data.lines ? (
              <>
                <th className="amount">Qty</th>
                <th className="amount">Rate</th>
              </>
            ) : null}
            <th className="amount">Amount</th>
          </tr>
        </thead>
        <tbody>
          {data.lines ? (
            data.lines.map((line, index) => (
              <tr key={index}>
                <td>{line.description}</td>
                <td className="amount">{line.quantity}</td>
                <td className="amount">{money(line.unit_price)}</td>
                <td className="amount">{money(line.quantity * line.unit_price)}</td>
              </tr>
            ))
          ) : (
            <tr>
              <td>{show.project && data.projectName ? `Production: ${data.projectName}` : 'Production services'}</td>
              <td className="amount">{money(data.amount)}</td>
            </tr>
          )}
          {show.paid && data.paid > 0 ? (
            <tr>
              <td colSpan={data.lines ? 3 : 1}>Paid so far</td>
              <td className="amount">−{money(data.paid)}</td>
            </tr>
          ) : null}
          <tr className="total">
            <td colSpan={data.lines ? 3 : 1}>Amount due</td>
            <td className="amount">{money(show.paid ? outstanding : data.status === 'void' ? 0 : data.amount)}</td>
          </tr>
        </tbody>
      </table>
      {show.notes && data.notes ? <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{data.notes}</p> : null}
      {options.footer ? <p className="invoice-footer">{options.footer}</p> : null}
    </article>
  );
}

type Loader = {
  from: (table: string) => {
    select: (columns: string) => { eq: (column: string, value: string) => { maybeSingle: () => PromiseLike<{ data: unknown }> } };
  };
};

/** Gathers what the sheet shows, with whichever client (signed in or service) is allowed to read it. */
export async function loadInvoiceSheet(db: Loader, invoice: Record<string, unknown>): Promise<{ data: InvoiceSheetData; options: InvoiceOptions }> {
  const [org, client, project, balance, logo] = await Promise.all([
    db.from('organizations').select('*').eq('id', invoice.org_id as string).maybeSingle(),
    db.from('clients').select('name, contact_name, email, phone').eq('id', invoice.client_id as string).maybeSingle(),
    invoice.project_id ? db.from('projects').select('name').eq('id', invoice.project_id as string).maybeSingle() : Promise.resolve({ data: null }),
    db.from('invoice_balances').select('paid').eq('invoice_id', invoice.id as string).maybeSingle(),
    // The company's own logo from Settings → Company, if it has one.
    db.from('org_logos').select('data').eq('org_id', invoice.org_id as string).maybeSingle(),
  ]);
  const c = client.data as { name: string; contact_name: string | null; email: string | null; phone: string | null } | null;
  const orgRow = org.data as
    | { name: string; invoice_options?: unknown; contact_address?: string | null; contact_phone?: string | null; contact_email?: string | null; website?: string | null }
    | null;
  const data: InvoiceSheetData = {
    orgName: orgRow?.name ?? '',
    logo: (logo.data as { data?: string } | null)?.data ?? null,
    orgLines: [orgRow?.contact_address, orgRow?.contact_phone, orgRow?.contact_email, orgRow?.website].filter((line): line is string => Boolean(line)),
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
