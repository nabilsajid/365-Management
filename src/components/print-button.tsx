'use client';

import { Printer } from 'lucide-react';

/** Opens the browser's print dialog, where "Save as PDF" makes a PDF. */
export function PrintButton({ label = 'Print or save as PDF' }: { label?: string }) {
  return (
    <button type="button" className="primary no-print" onClick={() => window.print()}>
      <Printer size={14} aria-hidden style={{ marginRight: 6 }} />
      {label}
    </button>
  );
}
