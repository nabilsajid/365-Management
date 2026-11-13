'use client';

export interface AwardPerson {
  id: string;
  name: string;
  role: string | null;
  note: string;
}

export function AwardProjectPoints({ projectId, people }: { projectId: string; people: AwardPerson[] }) {
  return projectId && people ? null : null;
}
