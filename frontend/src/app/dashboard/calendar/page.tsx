'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/Card';
import { PostsCalendar } from '@/components/PostsCalendar';
import { ContributionGraph } from '@/components/ContributionGraph';
import { Select } from '@/components/Select';
import { api } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import type { Post, Project } from '@/lib/types';

export default function CalendarPage() {
  const router = useRouter();
  const { data: posts = [] } = useApi<Post[]>('posts:list', () => api.posts.list() as Promise<Post[]>);
  const { data: projects = [] } = useApi<Project[]>('projects:list', () => api.projects.list() as Promise<Project[]>);
  const [projectId, setProjectId] = useState<string>('');

  // Default to first project once projects load.
  useEffect(() => {
    if (!projectId && projects.length) setProjectId(projects[0].id);
  }, [projects, projectId]);

  const projectOptions = useMemo(
    () => projects.map((p) => ({ value: p.id, label: p.fullName })),
    [projects],
  );

  const onSelectPost = useCallback(
    (p: Post) => router.push(`/dashboard/posts/${p.id}`),
    [router],
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card
        title="GitHub contributions"
        action={
          <div style={{ minWidth: 260 }}>
            <Select
              value={projectId}
              onChange={setProjectId}
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
          onSelectPost={onSelectPost}
        />
      </Card>
    </div>
  );
}
