'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/Card';
import { PostsCalendar } from '@/components/PostsCalendar';
import { ContributionGraph } from '@/components/ContributionGraph';
import { Select } from '@/components/Select';
import { api } from '@/lib/api';
import type { Post, Project } from '@/lib/types';

export default function CalendarPage() {
  const router = useRouter();
  const [posts, setPosts] = useState<Post[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState<string>('');

  useEffect(() => {
    (async () => {
      const [ps, pj] = await Promise.all([api.posts.list(), api.projects.list()]);
      setPosts(ps as Post[]);
      setProjects(pj as Project[]);
      const first = (pj as Project[])[0];
      if (first) setProjectId(first.id);
    })();
  }, []);

  const projectOptions = projects.map((p) => ({ value: p.id, label: p.fullName }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card
        title="GitHub contributions"
        action={
          <div style={{ minWidth: 260 }}>
            <Select
              value={projectId}
              onChange={(v) => setProjectId(v)}
              options={projectOptions}
              placeholder="Select a project"
              fullWidth
            />
          </div>
        }
      >
        {projectId ? (
          <ContributionGraph projectId={projectId} />
        ) : (
          <div style={{ opacity: 0.6 }}>Pick a project to see contributions.</div>
        )}
      </Card>

      <Card title="Posts calendar">
        <PostsCalendar
          posts={posts}
          onSelectPost={(p) => router.push(`/dashboard/posts/${p.id}`)}
        />
      </Card>
    </div>
  );
}
