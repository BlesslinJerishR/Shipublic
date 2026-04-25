'use client';

import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Plus, X, Search, Lock, Globe, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { invalidate, useApi } from '@/lib/useApi';
import type { Project, RepoSummary } from '@/lib/types';
import styles from './projects.module.css';

export default function ProjectsPage() {
  const { data: projects = [], mutate: mutateProjects } = useApi<Project[]>(
    'projects:list',
    () => api.projects.list() as Promise<Project[]>,
  );
  const [adding, setAdding] = useState(false);
  const [repos, setRepos] = useState<RepoSummary[]>([]);
  const [reposLoading, setReposLoading] = useState(false);
  const [filter, setFilter] = useState('');
  const deferredFilter = useDeferredValue(filter);
  const [busyId, setBusyId] = useState<number | null>(null);

  const router = useRouter();
  const search = useSearchParams();

  const openAdd = useCallback(async () => {
    setAdding(true);
    setReposLoading(true);
    try {
      const list = (await api.projects.available()) as RepoSummary[];
      setRepos(list);
    } finally {
      setReposLoading(false);
    }
  }, []);

  useEffect(() => {
    if (search?.get('add') === '1') {
      openAdd();
      router.replace('/dashboard/projects');
    }
  }, [search, router, openAdd]);

  const addRepo = useCallback(
    async (r: RepoSummary) => {
      setBusyId(r.id);
      try {
        await api.projects.add(r.id);
        await mutateProjects();
        setAdding(false);
      } finally {
        setBusyId(null);
      }
    },
    [mutateProjects],
  );

  const remove = useCallback(
    async (p: Project) => {
      if (!confirm(`Remove ${p.fullName}?`)) return;
      await api.projects.remove(p.id);
      invalidate('projects:');
      await mutateProjects();
    },
    [mutateProjects],
  );

  const filtered = useMemo(() => {
    if (!deferredFilter) return repos;
    const q = deferredFilter.toLowerCase();
    return repos.filter((r) => r.fullName.toLowerCase().includes(q));
  }, [repos, deferredFilter]);

  const linked = useMemo(
    () => new Set(projects.map((p) => p.githubRepoId)),
    [projects],
  );

  return (
    <div>
      <div className={styles.toolbar}>
        <h2 style={{ margin: 0 }}>Projects</h2>
        <button className="heroBtn" onClick={openAdd}>
          <Plus size={14} /> Add project
        </button>
      </div>

      <div className={styles.list}>
        {projects.map((p) => (
          <div key={p.id} className={styles.row}>
            <div style={{ minWidth: 0 }}>
              <Link href={`/dashboard/projects/${p.id}`} prefetch={false} style={{ color: 'var(--fg)', fontWeight: 700 }}>
                {p.fullName}
              </Link>
              <div className={styles.repoMeta}>
                {p.private ? <Lock size={11} /> : <Globe size={11} />} {p.defaultBranch}
                {p.autoSync && <span style={{ marginLeft: 8, color: 'var(--hero)' }}>auto sync</span>}
              </div>
              <div className={styles.repoMeta}>
                {p.description || 'No description'}
              </div>
            </div>
            <button onClick={() => remove(p)} title="Remove">
              <Trash2 size={14} />
            </button>
          </div>
        ))}
        {projects.length === 0 && <div style={{ opacity: 0.6 }}>No projects yet.</div>}
      </div>

      {adding && (
        <div className={styles.modalBackdrop} onClick={() => setAdding(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHead}>
              <strong>Select a repository</strong>
              <button onClick={() => setAdding(false)} aria-label="Close"><X size={14} /></button>
            </div>
            <div style={{ padding: '10px 18px' }}>
              <div style={{ position: 'relative' }}>
                <Search size={14} style={{ position: 'absolute', top: 12, left: 10, opacity: 0.6 }} />
                <input
                  placeholder="Filter repositories"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  style={{ paddingLeft: 30 }}
                />
              </div>
            </div>
            <div className={styles.modalBody}>
              {reposLoading && <div style={{ opacity: 0.6 }}>Loading repositories</div>}
              {!reposLoading && filtered.map((r) => {
                const already = linked.has(String(r.id));
                return (
                  <div key={r.id} className={styles.repoItem}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 600, display: 'flex', gap: 6, alignItems: 'center' }}>
                        {r.private ? <Lock size={12} /> : <Globe size={12} />} {r.fullName}
                      </div>
                      <div style={{ fontSize: 12, opacity: 0.6 }}>
                        {r.description || 'No description'}
                      </div>
                    </div>
                    <button
                      className={already ? '' : 'heroBtn'}
                      disabled={already || busyId === r.id}
                      onClick={() => addRepo(r)}
                    >
                      {already ? 'Linked' : busyId === r.id ? 'Adding' : 'Add'}
                    </button>
                  </div>
                );
              })}
              {!reposLoading && filtered.length === 0 && (
                <div style={{ opacity: 0.6 }}>No repositories match.</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
