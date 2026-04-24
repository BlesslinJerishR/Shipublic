'use client';

import styles from './Heatmap.module.css';

export interface HeatmapDay { date: string; count: number; }

function levelColor(count: number, max: number) {
  if (count <= 0) return 'rgba(var(--fgRgb), 0.08)';
  const ratio = Math.min(1, count / Math.max(1, max));
  const alpha = 0.20 + ratio * 0.80;
  return `rgba(255, 0, 79, ${alpha.toFixed(3)})`;
}

export function Heatmap({
  days,
  weeks = 26,
  onSelect,
}: {
  days: HeatmapDay[];
  weeks?: number;
  onSelect?: (d: HeatmapDay) => void;
}) {
  const map = new Map<string, number>();
  for (const d of days) map.set(d.date, d.count);

  const today = new Date();
  const start = new Date(today);
  start.setDate(today.getDate() - (weeks * 7 - 1));
  while (start.getDay() !== 0) start.setDate(start.getDate() - 1);

  const max = Math.max(1, ...days.map((d) => d.count));
  const cols: HeatmapDay[][] = [];
  let cur = new Date(start);
  for (let w = 0; w < weeks + 2; w++) {
    const week: HeatmapDay[] = [];
    for (let d = 0; d < 7; d++) {
      const iso = cur.toISOString().substring(0, 10);
      week.push({ date: iso, count: map.get(iso) ?? 0 });
      cur.setDate(cur.getDate() + 1);
    }
    cols.push(week);
    if (cur > today) break;
  }

  return (
    <div>
      <div className={styles.heat}>
        {cols.map((week, wi) => (
          <div key={wi} className={styles.col}>
            {week.map((day) => (
              <div
                key={day.date}
                className={styles.cell}
                title={`${day.date}: ${day.count}`}
                style={{ background: levelColor(day.count, max) }}
                onClick={() => onSelect?.(day)}
              />
            ))}
          </div>
        ))}
      </div>
      <div className={styles.legend}>
        <span>less</span>
        {[0, 0.25, 0.5, 0.75, 1].map((r, i) => (
          <span
            key={i}
            className={styles.swatch}
            style={{
              background:
                r === 0 ? 'rgba(var(--fgRgb), 0.08)' : `rgba(255, 0, 79, ${0.2 + r * 0.8})`,
            }}
          />
        ))}
        <span>more</span>
      </div>
    </div>
  );
}
