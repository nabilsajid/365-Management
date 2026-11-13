import type { ChangeDetails } from '@/lib/domain/changes';

/** One change request, laid out as a heading and a list of labelled fields. */
export function ChangeSummary({ details }: { details: ChangeDetails }) {
  return (
    <div className="change">
      <p className="change-heading">
        {details.heading}
        {details.name ? <span className="change-name">{details.name}</span> : null}
      </p>
      {details.fields.length > 0 ? (
        <dl className="change-fields">
          {details.fields.map((field) => (
            <div key={field.label}>
              <dt>{field.label}</dt>
              <dd>{field.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </div>
  );
}
