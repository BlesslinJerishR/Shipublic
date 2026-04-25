'use client';

import { memo, useCallback, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Sparkles, Send } from 'lucide-react';
import type { Post } from '@/lib/types';
import styles from './PostsCalendar.module.css';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function startOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function endOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth() + 1, 0); }
function addMonths(d: Date, n: number) { return new Date(d.getFullYear(), d.getMonth() + n, 1); }
function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function PostsCalendarImpl({
  posts,
  onSelectDate,
  onSelectPost,
}: {
  posts: Post[];
  onSelectDate?: (d: Date) => void;
  onSelectPost?: (p: Post) => void;
}) {
  const [cursor, setCursor] = useState(() => startOfMonth(new Date()));

  const cells = useMemo(() => {
    const first = startOfMonth(cursor);
    const last = endOfMonth(cursor);
    const start = new Date(first);
    start.setDate(first.getDate() - first.getDay());
    const end = new Date(last);
    end.setDate(last.getDate() + (6 - last.getDay()));
    const out: Date[] = [];
    const cur = new Date(start);
    while (cur <= end) {
      out.push(new Date(cur));
      cur.setDate(cur.getDate() + 1);
    }
    return out;
  }, [cursor]);

  const byDay = useMemo(() => {
    const m = new Map<string, Post[]>();
    for (const p of posts) {
      const d = p.scheduledFor || p.publishedAt || p.createdAt;
      const key = d.substring(0, 10);
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(p);
    }
    return m;
  }, [posts]);

  // Compute "today" once per render (cheap) and stash month index for the loop
  // so we don't allocate inside it.
  const today = useMemo(() => new Date(), []);
  const cursorMonth = cursor.getMonth();

  const goPrev = useCallback(() => setCursor((c) => addMonths(c, -1)), []);
  const goNext = useCallback(() => setCursor((c) => addMonths(c, 1)), []);

  return (
    <div className={styles.cal}>
      <div className={styles.head}>
        <button onClick={goPrev} aria-label="Previous month">
          <ChevronLeft size={16} />
        </button>
        <div className={styles.month}>
          {cursor.toLocaleString(undefined, { month: 'long', year: 'numeric' })}
        </div>
        <button onClick={goNext} aria-label="Next month">
          <ChevronRight size={16} />
        </button>
      </div>
      <div className={styles.grid}>
        {WEEKDAYS.map((w) => (
          <div key={w} className={styles.weekday}>{w}</div>
        ))}
        {cells.map((d) => {
          const inMonth = d.getMonth() === cursorMonth;
          const key = d.toISOString().substring(0, 10);
          const list = byDay.get(key) || [];
          return (
            <div
              key={key}
              className={`${styles.day} ${!inMonth ? styles.dayMuted : ''}`}
              onClick={() => onSelectDate?.(d)}
            >
              <div className={styles.dayNum}>
                {d.getDate()}
                {isSameDay(d, today) && <span className={styles.todayDot} />}
              </div>
              {list.slice(0, 3).map((p) => {
                const cls = p.status === 'PUBLISHED' || p.status === 'SCHEDULED' ? styles.pill : `${styles.pill} ${styles.pillDraft}`;
                const Icon = p.status === 'PUBLISHED' ? Send : Sparkles;
                return (
                  <span
                    key={p.id}
                    className={cls}
                    onClick={(e) => { e.stopPropagation(); onSelectPost?.(p); }}
                    title={p.content?.slice(0, 80) || p.status}
                  >
                    <Icon size={11} />
                    {p.platform.toLowerCase()}
                  </span>
                );
              })}
              {list.length > 3 && (
                <span style={{ fontSize: 11, color: 'rgba(var(--fgRgb), 0.5)' }}>
                  +{list.length - 3} more
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export const PostsCalendar = memo(PostsCalendarImpl);
