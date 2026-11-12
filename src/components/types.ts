export interface Option {
  value: string;
  label: string;
}

export interface Field {
  name: string;
  label: string;
  /** `links` is a textarea of file links, one per line, saved as a list. */
  type?: 'text' | 'number' | 'date' | 'month' | 'textarea' | 'select' | 'checkbox' | 'links' | 'email';
  options?: Option[];
  required?: boolean;
  placeholder?: string;
  /** Pre-filled value when adding a new record. */
  defaultValue?: string;
  hint?: string;
}

export interface Column {
  key: string;
  label: string;
  /** `nav` links inside the app and `link` links out; both read the URL from `hrefKey`. */
  kind?: 'text' | 'money' | 'number' | 'bool' | 'label' | 'nav' | 'link' | 'links';
  hrefKey?: string;
}

export type Row = Record<string, unknown> & { id: string };
