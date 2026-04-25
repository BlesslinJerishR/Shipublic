'use client';

import { useMemo } from 'react';
import styles from './Heatmap.module.css';

export interface HeatmapDay { date: string; count: number; }

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY_LABELS = ['', 'Mon', '', 'Wed', '', 'Fri', ''];

function levelOfCount(count: number, max: number): 0 | 1 | 2 | 3 | 4 {
  if (count <= 0) return 0;
  if (max <= 1) return 4;
  const ratio = count / max;
  if (ratio < 0.25) return 1;
  if (ratio < 0.5) return 2;
  if (ratio < 0.75) return 3;
  return 4;
}

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function Heatmap({
  days,
  weeks,
  from,
  to,
  onSelect,
}: {
  days: HeatmapDay[];
  /** Legacy: number of trailing weeks ending today. Used only if from/to omitted. */
  weeks?: number;
  /** Inclusive lower bound of the visible range. */
  from?: Date;
  /** Inclusive upper bound of the visible range. */
  to?: Date;
  onSelect?: (d: HeatmapDay) => void;
}) {
  const map = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of days) m.set(d.date, d.count);
    return m;
  }, [days]);

  const max = useMemo(() => Math.max(1, ...days.map((d) => d.count)), [days]);

  const { columns, monthLabels } = useMemo(() => {
    const today = startOfDay(new Date());
    let rangeStart: Date;
    let end: Date;
    if (from) {
      rangeStart = startOfDay(from);
    } else {
      const w = weeks ?? 53;
      rangeStart = new Date(today);
      rangeStart.setDate(today.getDate() - (w * 7 - 1));
    }
    end = to ? startOfDay(to) : today;
    if (end > today) end = today;
    // Sunday-align grid start
    const gridStart = new Date(rangeStart);
    while (gridStart.getDay() !== 0) gridStart.setDate(gridStart.getDate() - 1);

    const cols: HeatmapDay[][] = [];
    const months: { col: number; label: string }[] = [];
    let lastMonth = -1;
    const cur = new Date(gridStart);
    let col = 0;
    while (cur <= end) {
      const week: HeatmapDay[] = [];
      for (let d = 0; d < 7; d++) {
        const iso = cur.toISOString().substring(0, 10);
        const inRange = cur >= rangeStart && cur <= end;
        week.push({ date: iso, count: inRange ? (map.get(iso) ?? 0) : -1 });
        if (d === 0) {
          const m = cur.getMonth();
          if (m !== lastMonth) {
            months.push({ col, label: MONTH_NAMES[m] });
            lastMonth = m;
          }
        }
        cur.setDate(cur.getDate() + 1);
      }
      cols.push(week);
      col++;
      if (col > 60) break;
    }
    return { columns: cols, monthLabels: months };
  }, [from, to, weeks, map]);

  return (
    <div className={styles.wrap}>
      <div className={styles.scroll}>
        <div className={styles.body}>
          <div className={styles.dayCol} aria-hidden>
            <span className={styles.monthSpacer} />
            {DAY_LABELS.map((l, i) => (
              <span key={i} className={styles.dayLabel}>{l}</span>
            ))}
          </div>

          <div className={styles.cells}>
            <div
              className={styles.monthRow}
              style={{ gridTemplateColumns: `repeat(${columns.length}, 12px)` }}
            >
              {monthLabels.map((m, i) => {
                const next = monthLabels[i + 1];
                const span = (next ? next.col : columns.length) - m.col;
                if (span < 2) return <span key={i} style={{ gridColumn: `span ${span}` }} />;
                return (
                  <span key={i} className={styles.monthLabel} style={{ gridColumn: `span ${span}` }}>
                    {m.label}
                  </span>
                );
              })}
            </div>
            <div className={styles.grid}>
              {columns.map((week, wi) => (
                <div key={wi} className={styles.col}>
                  {week.map((day) => {
                    if (day.count < 0) {
                      return <div key={day.date} className={`${styles.cell} ${styles.cellEmpty}`} aria-hidden />;
                    }
                    const level = levelOfCount(day.count, max);
                    const dt = new Date(day.date);
                    const dateLabel = dt.toLocaleDateString(undefined, {
                      weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
                    });
                    return (
                      <button
                        type="button"
                        key={day.date}
                        className={`${styles.cell} ${styles[`level${level}`]}`}
                        title={day.count === 0 ? `No contributions on ${dateLabel}` : `${day.count} contribution${day.count > 1 ? 's' : ''} on ${dateLabel}`}
                        aria-label={`${day.count} contributions on ${dateLabel}`}
                        onClick={() => onSelect?.(day)}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      <div className={styles.legend}>
        <span className={styles.legendLabel}>Less</span>
        {[0, 1, 2, 3, 4].map((l) => (
          <span key={l} className={`${styles.swatch} ${styles[`level${l}`]}`} />
        ))}
        <span className={styles.legendLabel}>More</span>
      </div>
    </div>
  );
}
