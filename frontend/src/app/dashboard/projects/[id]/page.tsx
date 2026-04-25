'use client';

import { useEffect, useState } from 'react';
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
import { ContributionGraph } from '@/components/ContributionGraph';
import { Select } from '@/components/Select';
import type { Commit, Project } from '@/lib/types';
import styles from './project.module.css';

function isoDate(d: Date) { return d.toISOString().substring(0, 10); }

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
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [platform, setPlatform] = useState<'TWITTER' | 'LINKEDIN' | 'GENERIC'>('LINKEDIN');
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [generating, setGenerating] = useState(false);

  const loadAll = async () => {
    const [p, cs] = await Promise.all([
      api.projects.get(id),
      api.commits.list(id, { from, to, take: 100 }),
    ]);
    setProject(p as Project);
    setCommits(cs as Commit[]);
  };

  useEffect(() => {
    (async () => {
      setLoading(true);
      try { await loadAll(); } finally { setLoading(false); }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const reloadCommits = async () => {
    const cs = await api.commits.list(id, { from, to, take: 100 });
    setCommits(cs as Commit[]);
  };

  const sync = async () => {
    setSyncing(true);
    try {
      await api.commits.sync(id, {
        since: `${from}T00:00:00Z`,
        until: `${to}T23:59:59Z`,
        perPage: 100,
      });
      await reloadCommits();
    } finally { setSyncing(false); }
  };

  const toggleSync = async () => {
    if (!project) return;
    const next = !project.autoSync;
    try {
      const updated = await api.projects.setAutoSync(project.id, next);
      setProject(updated as Project);
    } catch (e: any) {
      alert(e?.message || 'Failed to toggle auto sync');
    }
  };

  const toggleCommit = (sha: string) => {
    const s = new Set(selected);
    if (s.has(sha)) s.delete(sha); else s.add(sha);
    setSelected(s);
  };
  const selectAll = () => setSelected(new Set(commits.map((c) => c.sha)));
  const clearSel = () => setSelected(new Set());

  const generate = async (mode: 'selection' | 'range') => {
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
  };

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
                    <RefreshCw size={14} /> {syncing ? 'Syncing' : 'Sync from GitHub'}
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
              {commits.map((c) => {
                const on = selected.has(c.sha);
                return (
                  <div key={c.id} className={styles.commitRow} onClick={() => toggleCommit(c.sha)}>
                    <span className={`${styles.checkbox} ${on ? styles.checkboxOn : ''}`}>
                      {on && <Check size={12} color="#fff" />}
                    </span>
                    <div style={{ minWidth: 0 }}>
                      <div className={styles.commitMsg} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {c.message.split('\n')[0]}
                      </div>
                      <div className={styles.commitMeta}>
                        {c.authorName || 'unknown'} · {new Date(c.authoredAt).toLocaleString()}
                      </div>
                    </div>
                    <span className={styles.shaPill}>{c.sha.substring(0, 7)}</span>
                  </div>
                );
              })}
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
                  options={[
                    { value: 'GENERIC', label: 'Generic' },
                    { value: 'TWITTER', label: 'Twitter' },
                    { value: 'LINKEDIN', label: 'LinkedIn' },
                  ]}
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
