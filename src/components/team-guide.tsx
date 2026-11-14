import { BookOpen } from 'lucide-react';
import { TEAM_GUIDE } from '@/lib/content/team-guide';

/** Pinned to the notice board for everyone, new people especially. */
export function TeamGuide() {
  return (
    <section className="panel team-guide" id="guide" aria-labelledby="guide-title">
      <header className="panel-header">
        <div className="flex items-start gap-3">
          <span className="company-icon" aria-hidden>
            <BookOpen size={18} />
          </span>
          <div>
            <h2 id="guide-title">
              Team guide <span className="badge">Pinned</span>
            </h2>
            <p className="muted">How the app works and how we work. Open any topic to read it; it stays here for whenever you need it.</p>
          </div>
        </div>
      </header>
      <div className="guide-topics">
        {TEAM_GUIDE.map((section, index) => (
          <details key={section.id} id={`guide-${section.id}`}>
            <summary>
              <span className="guide-number">{index + 1}</span>
              {section.title}
            </summary>
            <div className="guide-body">
              {section.intro ? <p>{section.intro}</p> : null}
              <ul>
                {section.points.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}
