import { ListPlus } from 'lucide-react';
import { TASK_KINDS, TASK_KIND_SINGLE } from '@/lib/domain/deliverables';
import { ActionButton, ApiForm } from './resource-manager';

/**
 * A monthly client's month: create its tasks from the fixed deliverables in one
 * click, or add several copies of a task at once ("Video" ×5). Every task can
 * then be assigned to the same person or different people.
 */
export function MonthTasksToolbar({
  projectId,
  monthId,
  monthLabel,
  missing,
  hasFixed,
  people,
  showPoints,
}: {
  projectId: string;
  monthId: string;
  monthLabel: string;
  missing: number;
  hasFixed: boolean;
  people: { value: string; label: string }[];
  showPoints: boolean;
}) {
  return (
    <section className="panel">
      <header className="panel-header">
        <div>
          <h2>{monthLabel} tasks</h2>
          <p className="muted">
            Each video, thumbnail, photo or post is its own task with its own person and date. Make them all at once,
            then assign each one below with Edit.
          </p>
        </div>
        {hasFixed ? (
          missing > 0 ? (
            <ActionButton endpoint="/api/tasks/bulk" body={{ project_id: projectId, month_id: monthId, from_fixed: true }} primary>
              <ListPlus size={14} aria-hidden style={{ marginRight: 6 }} />
              Create {missing} {missing === 1 ? 'task' : 'tasks'} from fixed deliverables
            </ActionButton>
          ) : (
            <span className="badge badge-approved">Every fixed deliverable has its tasks</span>
          )
        ) : null}
      </header>
      <details className="fold-inline">
        <summary>Add tasks (one or several copies)</summary>
        <ApiForm
          endpoint="/api/tasks/bulk"
          submitLabel="Add"
          fixedValues={{ project_id: projectId, month_id: monthId }}
          initial={{ kind: 'video', count: '1' }}
          fields={[
            { name: 'kind', label: 'Type', type: 'select', required: true, options: TASK_KINDS.map((kind) => ({ value: kind, label: TASK_KIND_SINGLE[kind] })) },
            { name: 'title', label: 'Name', required: true, placeholder: 'Video', hint: 'Several copies are numbered: Video 1, Video 2…' },
            { name: 'count', label: 'How many', type: 'number', required: true },
            { name: 'assignee_id', label: 'Assign to', type: 'select', options: people, hint: 'Optional. Each copy can be reassigned later.' },
            { name: 'due_date', label: 'Due date', type: 'date' },
            ...(showPoints ? [{ name: 'points_value', label: 'Points on approval', type: 'number' as const }] : []),
            { name: 'description', label: 'Notes / requirements', type: 'textarea' },
          ]}
        />
      </details>
    </section>
  );
}
