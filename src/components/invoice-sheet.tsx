import { money } from '@/lib/format';

export interface InvoiceSheetData {
  orgName: string;
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
}

/** An invoice laid out to read on screen and print cleanly (Save as PDF). */
export function InvoiceSheet({ data }: { data: InvoiceSheetData }) {
  const outstanding = data.status === 'void' ? 0 : Math.max(0, data.amount - data.paid);
  return (
    <article className="invoice-sheet">
      <div className="invoice-top">
        <div>
          <p className="muted" style={{ margin: 0 }}>{data.orgName}</p>
          <h1>Invoice {data.invoiceNumber}</h1>
        </div>
        <dl className="detail" style={{ margin: 0 }}>
          <dt>Issued</dt>
          <dd>{data.issueDate}</dd>
          <dt>Due</dt>
          <dd>{data.dueDate ?? 'On receipt'}</dd>
          <dt>Status</dt>
          <dd>{data.status === 'void' ? 'Cancelled' : outstanding <= 0 ? 'Paid' : data.paid > 0 ? 'Partly paid' : 'Unpaid'}</dd>
        </dl>
      </div>
      <div>
        <p className="muted" style={{ margin: 0 }}>Bill to</p>
        <p style={{ margin: 0, fontWeight: 600 }}>{data.clientName}</p>
        {[data.clientContact, data.clientEmail, data.clientPhone].filter(Boolean).map((line) => (
          <p key={line!} style={{ margin: 0 }}>{line}</p>
        ))}
      </div>
      <table>
        <thead>
          <tr>
            <th>Description</th>
            <th className="amount">Amount</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>{data.projectName ? `Production: ${data.projectName}` : 'Production services'}</td>
            <td className="amount">{money(data.amount)}</td>
          </tr>
          {data.paid > 0 ? (
            <tr>
              <td>Paid so far</td>
              <td className="amount">−{money(data.paid)}</td>
            </tr>
          ) : null}
          <tr className="total">
            <td>Amount due</td>
            <td className="amount">{money(outstanding)}</td>
          </tr>
        </tbody>
      </table>
      {data.notes ? <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{data.notes}</p> : null}
    </article>
  );
}

type Loader = {
  from: (table: string) => {
    select: (columns: string) => { eq: (column: string, value: string) => { maybeSingle: () => PromiseLike<{ data: unknown }> } };
  };
};

/** Gathers what the sheet shows, with whichever client (signed in or service) is allowed to read it. */
export async function loadInvoiceSheet(db: Loader, invoice: Record<string, unknown>): Promise<InvoiceSheetData> {
  const [org, client, project, balance] = await Promise.all([
    db.from('organizations').select('name').eq('id', invoice.org_id as string).maybeSingle(),
    db.from('clients').select('name, contact_name, email, phone').eq('id', invoice.client_id as string).maybeSingle(),
    invoice.project_id ? db.from('projects').select('name').eq('id', invoice.project_id as string).maybeSingle() : Promise.resolve({ data: null }),
    db.from('invoice_balances').select('paid').eq('invoice_id', invoice.id as string).maybeSingle(),
  ]);
  const c = client.data as { name: string; contact_name: string | null; email: string | null; phone: string | null } | null;
  return {
    orgName: (org.data as { name: string } | null)?.name ?? '',
    invoiceNumber: invoice.invoice_number as string,
    issueDate: invoice.issue_date as string,
    dueDate: (invoice.due_date as string | null) ?? null,
    status: invoice.status as string,
    amount: Number(invoice.amount),
    paid: Number((balance.data as { paid: number } | null)?.paid ?? 0),
    notes: (invoice.notes as string | null) ?? null,
    clientName: c?.name ?? '—',
    clientContact: c?.contact_name ?? null,
    clientEmail: c?.email ?? null,
    clientPhone: c?.phone ?? null,
    projectName: (project.data as { name: string } | null)?.name ?? null,
  };
}
