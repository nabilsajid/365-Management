import { BellRing, Pin } from 'lucide-react';
import { noticeTimeLeft } from '@/lib/domain/notices';
import { cn } from '@/lib/utils';

export interface NoticeItem {
  id: string;
  title: string;
  body: string | null;
  is_urgent: boolean;
  expires_at: string | null;
  /** Already formatted in the organization's timezone. */
  posted: string;
  author?: string | null;
}

/** Notices as a stack of cards; urgent ones carry a subtle red tone. */
export function NoticeList({ notices, now }: { notices: NoticeItem[]; now: Date }) {
  return (
    <ul className="notice-list">
      {notices.map((notice, index) => (
        <li key={notice.id} className={cn('notice', notice.is_urgent && 'notice-urgent')} style={{ animationDelay: `${index * 40}ms` }}>
          <span className="notice-icon" aria-hidden>
            {notice.is_urgent ? <BellRing size={15} /> : <Pin size={15} />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="notice-title">
              {notice.title}
              {notice.is_urgent ? <span className="notice-flag">Urgent</span> : null}
            </p>
            {notice.body ? <p className="notice-body">{notice.body}</p> : null}
            <p className="notice-meta">
              {notice.author ? `${notice.author} · ` : ''}
              {notice.posted} · {noticeTimeLeft(notice.expires_at, now)}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}
