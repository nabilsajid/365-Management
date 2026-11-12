// Rules for what counts as a valid task submission.

export type SubmissionKindInput = 'drive' | 'dropbox' | 'text';

const HOSTS: Record<'drive' | 'dropbox', string[]> = {
  drive: ['drive.google.com', 'docs.google.com'],
  dropbox: ['dropbox.com', 'dropboxusercontent.com'],
};

function hostMatches(host: string, allowed: string[]): boolean {
  return allowed.some((domain) => host === domain || host.endsWith(`.${domain}`));
}

/** Returns a message describing what is wrong, or null when the submission is valid. */
export function submissionProblem(input: {
  kind: SubmissionKindInput;
  url?: string | null;
  note?: string | null;
}): string | null {
  if (input.kind === 'text') {
    return input.note && input.note.trim() ? null : 'A text submission needs a note.';
  }

  const name = input.kind === 'drive' ? 'Google Drive' : 'Dropbox';
  if (!input.url || !input.url.trim()) return `A ${name} submission needs a link.`;

  let host: string;
  try {
    const url = new URL(input.url.trim());
    if (url.protocol !== 'https:') return `The ${name} link must start with https://.`;
    host = url.hostname.toLowerCase();
  } catch {
    return `The ${name} link is not a valid URL.`;
  }
  return hostMatches(host, HOSTS[input.kind]) ? null : `That link is not a ${name} link.`;
}
