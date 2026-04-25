'use client';

import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { Heatmap } from './Heatmap';
import styles from './ContributionGraph.module.css';

export interface ContribDay { date: string; count: number; }

interface RangeTab {
  key: string;
  label: string;
  from: () => Date;
  to: () => Date;
}

function startOfYear(year: number) { return new Date(Date.UTC(year, 0, 1)); }
function endOfYear(year: number) { return new Date(Date.UTC(year, 11, 31, 23, 59, 59)); }
function isoOfDate(d: Date) { return d.toISOString().substring(0, 10); }

export function ContributionGraph(props: {
  projectId?: string | null;
  startYear?: number;
  className?: string;
}) {
  return <ContributionGraphImpl {...props} />;
}

const ContributionGraphImpl = memo(function ContributionGraphImpl({
  projectId,
  startYear,
  className,
}: {
  projectId?: string | null;
  /** Earliest year to expose as a tab. Defaults to currentYear - 4. */
  startYear?: number;
  className?: string;
}) {
  const currentYear = new Date().getUTCFullYear();
  const earliest = startYear ?? currentYear - 4;

  const tabs = useMemo<RangeTab[]>(() => {
    const out: RangeTab[] = [
      {
        key: 'last365',
        label: 'Last 365 days',
        from: () => {
          const d = new Date();
          d.setUTCDate(d.getUTCDate() - 365);
          return d;
        },
        to: () => new Date(),
      },
    ];
    for (let y = currentYear; y >= earliest; y--) {
      out.push({
        key: String(y),
        label: String(y),
        from: () => startOfYear(y),
        to: () => (y === currentYear ? new Date() : endOfYear(y)),
      });
    }
    return out;
  }, [currentYear, earliest]);

  const [active, setActive] = useState<string>('last365');
  const [days, setDays] = useState<ContribDay[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId) { setDays([]); setTotal(0); return; }
    const tab = tabs.find((t) => t.key === active) || tabs[0];
    const fromDate = tab.from();
    const toDate = tab.to();
    const fromIso = `${isoOfDate(fromDate)}T00:00:00Z`;
    const toIso = `${isoOfDate(toDate)}T23:59:59Z`;

    let cancelled = false;
    setLoading(true);
    setError(null);
    api.projects.contributions(projectId, fromIso, toIso)
      .then((cal: any) => {
        if (cancelled) return;
        const flat: ContribDay[] = (cal?.weeks || []).flatMap((w: any) =>
          w.contributionDays.map((d: any) => ({ date: d.date, count: d.contributionCount })),
        );
        setDays(flat);
        setTotal(Number(cal?.totalContributions || flat.reduce((a, d) => a + d.count, 0)));
      })
      .catch((e: any) => {
        if (cancelled) return;
        setError(e?.message || 'Failed to load contributions');
        setDays([]);
        setTotal(0);
      })
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [projectId, active, tabs]);

  const tab = tabs.find((t) => t.key === active) || tabs[0];

  const onTabClick = useCallback((k: string) => setActive(k), []);

  // Recompute the active tab range only when the tab key changes.
  const range = useMemo(() => ({ from: tab.from(), to: tab.to() }), [tab]);

  return (
    <div className={`${styles.wrap} ${className || ''}`}>
      <div className={styles.head}>
        <div className={styles.summary}>
          {projectId
            ? loading
              ? 'Loading contributions…'
              : <><strong>{total.toLocaleString()}</strong> contributions in {tab.label.toLowerCase()}</>
            : 'Select a project to see contributions.'}
        </div>
        <div className={styles.tabs} role="tablist" aria-label="Contribution range">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={active === t.key}
              className={`${styles.tab} ${active === t.key ? styles.tabOn : ''}`}
              onClick={() => onTabClick(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <Heatmap
        days={days}
        from={range.from}
        to={range.to}
      />

      {error && <div className={styles.error}>{error}</div>}
    </div>
  );
});
