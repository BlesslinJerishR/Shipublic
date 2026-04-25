'use client';

import { memo, useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import dynamic from 'next/dynamic';
import { useParams, useRouter } from 'next/navigation';
import {
  RefreshCw,
  GitCommit,
  Sparkles,
  Check,
  CalendarRange,
  Zap,
} from 'lucide-react';
import { api } from '@/lib/api';
import { Card } from '@/components/Card';
import { Select } from '@/components/Select';
import type { Commit, Project } from '@/lib/types';
import styles from './project.module.css';

// ContributionGraph hits the network and pulls in the Heatmap. Dynamically
// import it so the initial route shell loads quicker; SSR off because it is
// purely a client visualization.
const ContributionGraph = dynamic(
  () => import('@/components/ContributionGraph').then((m) => m.ContributionGraph),
  { ssr: false, loading: () => <div style={{ opacity: 0.6 }}>Loading contributions…</div> },
);

function isoDate(d: Date) { return d.toISOString().substring(0, 10); }

interface CommitRowProps {
  commit: Commit;
  selected: boolean;
  onToggle: (sha: string) => void;
}

const CommitRow = memo(function CommitRow({ commit, selected, onToggle }: CommitRowProps) {
  const handleClick = useCallback(() => onToggle(commit.sha), [commit.sha, onToggle]);
  // Single-line subject is stable per commit; memoize formatting so re-render
  // of the parent does not re-walk the message string.
  const subject = useMemo(() => commit.message.split('\n')[0], [commit.message]);
  const when = useMemo(() => new Date(commit.authoredAt).toLocaleString(), [commit.authoredAt]);
  return (
    <div className={styles.commitRow} onClick={handleClick}>
      <span className={`${styles.checkbox} ${selected ? styles.checkboxOn : ''}`}>
        {selected && <Check size={12} color="#fff" />}
      </span>
      <div style={{ minWidth: 0 }}>
        <div className={styles.commitMsg} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {subject}
        </div>
        <div className={styles.commitMeta}>
          {commit.authorName || 'unknown'} · {when}
        </div>
      </div>
      <span className={styles.shaPill}>{commit.sha.substring(0, 7)}</span>
    </div>
  );
});

export default function ProjectDetail() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;

  const [project, setProject] = useState<Project | null>(null);
  const [commits, setCommits] = useState<Commit[]>([]);
  const [from, setFrom] = useState<string>(() => {
    const d = new Date(); d.setDate(d.getDate() - 14); return isoDate(d);
  });
  const [to, setTo] = useState<string>(() => isoDate(new Date()));
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [platform, setPlatform] = useState<'TWITTER' | 'LINKEDIN' | 'GENERIC'>('LINKEDIN');
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [, startTransition] = useTransition();

  // Avoid stale-state captures when filters change rapidly.
  const fromRef = useRef(from); fromRef.current = from;
  const toRef = useRef(to); toRef.current = to;

  const loadAll = useCallback(async () => {
    const [p, cs] = await Promise.all([
      api.projects.get(id),
      api.commits.list(id, { from: fromRef.current, to: toRef.current, take: 100 }),
    ]);
    setProject(p as Project);
    setCommits(cs as Commit[]);
  }, [id]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    loadAll().finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [loadAll]);

  const reloadCommits = useCallback(async () => {
    const cs = await api.commits.list(id, { from, to, take: 100 });
    startTransition(() => setCommits(cs as Commit[]));
  }, [id, from, to]);

  const sync = useCallback(async () => {
    setSyncing(true);
    try {
      await api.commits.sync(id, {
        since: `${from}T00:00:00Z`,
        until: `${to}T23:59:59Z`,
        perPage: 100,
      });
      await reloadCommits();
    } finally { setSyncing(false); }
  }, [id, from, to, reloadCommits]);

  const toggleSync = useCallback(async () => {
    if (!project) return;
    const next = !project.autoSync;
    try {
      const updated = await api.projects.setAutoSync(project.id, next);
      setProject(updated as Project);
    } catch (e: any) {
      alert(e?.message || 'Failed to toggle auto sync');
    }
  }, [project]);

  // Stable callback so memoized CommitRow rows don't rerender on every parent update.
  const toggleCommit = useCallback((sha: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(sha)) next.delete(sha); else next.add(sha);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelected(new Set(commits.map((c) => c.sha)));
  }, [commits]);
  const clearSel = useCallback(() => setSelected(new Set()), []);

  const generate = useCallback(
    async (mode: 'selection' | 'range') => {
      setGenerating(true);
      try {
        const body: any = { projectId: id, platform };
        if (mode === 'selection') {
          if (!selected.size) { alert('Select at least one commit'); setGenerating(false); return; }
          body.commitShas = Array.from(selected);
        } else {
          body.rangeFrom = `${from}T00:00:00Z`;
          body.rangeTo = `${to}T23:59:59Z`;
        }
        const post = await api.posts.generate(body);
        router.push(`/dashboard/posts/${(post as any).id}`);
      } catch (e: any) {
        alert(e?.message || 'Failed to start generation');
      } finally { setGenerating(false); }
    },
    [id, platform, selected, from, to, router],
  );

  // Memoize platform dropdown options so the Select doesn't see a fresh array.
  const platformOptions = useMemo(
    () => [
      { value: 'GENERIC', label: 'Generic' },
      { value: 'TWITTER', label: 'Twitter' },
      { value: 'LINKEDIN', label: 'LinkedIn' },
    ],
    [],
  );

  if (loading || !project) return <div style={{ opacity: 0.6 }}>Loading project</div>;

  return (
    <div>
      <div className={styles.head}>
        <div className={styles.title}>
          <div className={styles.repoName}>{project.fullName}</div>
          <div className={styles.repoMeta}>{project.description || 'No description'}</div>
        </div>
        <div className={styles.toolbar}>
          <div
            className={`${styles.toggle} ${project.autoSync ? styles.toggleOn : ''}`}
            onClick={toggleSync}
            title="Install GitHub webhook to auto generate posts on push"
          >
            <span className={`${styles.dot} ${project.autoSync ? styles.dotOn : ''}`} />
            <Zap size={14} /> Auto sync {project.autoSync ? 'on' : 'off'}
          </div>
        </div>
      </div>

      <div className={styles.grid}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card
            title="Commits"
            action={
              <div className={styles.toolbar}>
                <div className={styles.field}>
                  <span className={styles.label}>From</span>
                  <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
                </div>
                <div className={styles.field}>
                  <span className={styles.label}>To</span>
                  <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
                </div>
                <div className={styles.field}>
                  <span className={styles.label}>&nbsp;</span>
                  <button onClick={reloadCommits}>Apply</button>
                </div>
                <div className={styles.field}>
                  <span className={styles.label}>&nbsp;</span>
                  <button onClick={sync} disabled={syncing} title="Pull latest from GitHub">
                    <RefreshCw size={14} /> {syncing ? 'Syncing' : 'Sync Git'}
                  </button>
                </div>
              </div>
            }
          >
            <div style={{ display: 'flex', gap: 8, marginBottom: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <button onClick={selectAll}>Select all</button>
              <button onClick={clearSel} disabled={!selected.size}>Clear ({selected.size})</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 540, overflowY: 'auto' }}>
              {commits.map((c) => (
                <CommitRow
                  key={c.id}
                  commit={c}
                  selected={selected.has(c.sha)}
                  onToggle={toggleCommit}
                />
              ))}
              {commits.length === 0 && (
                <div style={{ opacity: 0.6 }}>
                  No commits stored yet for this range. Click Sync from GitHub.
                </div>
              )}
            </div>
          </Card>

          <Card title="Contributions">
            <ContributionGraph projectId={id} />
          </Card>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card title="Generate post">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div className={styles.field}>
                <span className={styles.label}>Platform</span>
                <Select
                  value={platform}
                  onChange={(v) => setPlatform(v as any)}
                  options={platformOptions}
                  fullWidth
                />
              </div>
              <button
                className="heroBtn"
                disabled={generating || !selected.size}
                onClick={() => generate('selection')}
              >
                <Sparkles size={14} /> Generate from selection ({selected.size})
              </button>
              <button
                disabled={generating}
                onClick={() => generate('range')}
              >
                <CalendarRange size={14} /> Generate from date range
              </button>
              <div style={{ fontSize: 12, opacity: 0.6, marginTop: 4 }}>
                Pipeline: coder model summarizes diffs, chat model writes the post.
              </div>
            </div>
          </Card>

          <Card title="At a glance">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13 }}>
              <div><GitCommit size={12} /> Default branch: {project.defaultBranch}</div>
              <div>Last synced: {project.lastSyncedAt ? new Date(project.lastSyncedAt).toLocaleString() : 'never'}</div>
              <div>Visibility: {project.private ? 'private' : 'public'}</div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
