'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/Card';
import { api } from '@/lib/api';
import type { Post, Project } from '@/lib/types';

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'rgba(var(--fgRgb), 0.6)',
  SCHEDULED: 'var(--hero)',
  PUBLISHED: 'var(--hero)',
  FAILED: 'var(--hero)',
};

export default function PostsPage() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    (async () => {
      const [ps, pj] = await Promise.all([api.posts.list(), api.projects.list()]);
      setPosts(ps as Post[]);
      setProjects(pj as Project[]);
    })();
  }, []);

  const projectName = (id: string) => projects.find((p) => p.id === id)?.fullName ?? '';
  const filtered = posts.filter((p) =>
    !filter ||
    p.content.toLowerCase().includes(filter.toLowerCase()) ||
    projectName(p.projectId).toLowerCase().includes(filter.toLowerCase()),
  );

  return (
    <Card
      title="All posts"
      action={
        <input
          placeholder="Search posts"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          style={{ width: 240 }}
        />
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {filtered.map((p) => (
          <Link key={p.id} href={`/dashboard/posts/${p.id}`}>
            <div style={{
              border: '1px solid rgba(var(--fgRgb), 0.10)',
              padding: '12px 14px',
              borderRadius: 10,
              color: 'var(--fg)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, opacity: 0.6 }}>
                <span>
                  {projectName(p.projectId)} · {p.platform.toLowerCase()} ·{' '}
                  <span style={{ color: STATUS_COLORS[p.status] }}>{p.status.toLowerCase()}</span>
                </span>
                <span>{new Date(p.createdAt).toLocaleString()}</span>
              </div>
              <div style={{ marginTop: 6 }}>
                {p.content?.slice(0, 200) || (p.metadata?.generating ? 'Generating...' : 'Empty draft')}
              </div>
            </div>
          </Link>
        ))}
        {filtered.length === 0 && <div style={{ opacity: 0.6 }}>No posts.</div>}
      </div>
    </Card>
  );
}
