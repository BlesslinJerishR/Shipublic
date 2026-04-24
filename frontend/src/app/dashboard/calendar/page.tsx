'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/Card';
import { PostsCalendar } from '@/components/PostsCalendar';
import { Heatmap } from '@/components/Heatmap';
import { api } from '@/lib/api';
import type { Post, Project } from '@/lib/types';

export default function CalendarPage() {
  const router = useRouter();
  const [posts, setPosts] = useState<Post[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState<string>('');
  const [contrib, setContrib] = useState<{ date: string; count: number }[]>([]);

  useEffect(() => {
    (async () => {
      const [ps, pj] = await Promise.all([api.posts.list(), api.projects.list()]);
      setPosts(ps as Post[]);
      setProjects(pj as Project[]);
      const first = (pj as Project[])[0];
      if (first) {
        setProjectId(first.id);
        try {
          const cal = await api.projects.contributions(first.id);
          const days = (cal as any).weeks.flatMap((w: any) =>
            w.contributionDays.map((d: any) => ({ date: d.date, count: d.contributionCount })),
          );
          setContrib(days);
        } catch {}
      }
    })();
  }, []);

  const onChangeProject = async (id: string) => {
    setProjectId(id);
    if (!id) { setContrib([]); return; }
    try {
      const cal = await api.projects.contributions(id);
      const days = (cal as any).weeks.flatMap((w: any) =>
        w.contributionDays.map((d: any) => ({ date: d.date, count: d.contributionCount })),
      );
      setContrib(days);
    } catch { setContrib([]); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card
        title="GitHub contributions"
        action={
          <select value={projectId} onChange={(e) => onChangeProject(e.target.value)} style={{ width: 240 }}>
            <option value="">Select a project</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.fullName}</option>
            ))}
          </select>
        }
      >
        {contrib.length ? <Heatmap days={contrib} weeks={26} /> : <div style={{ opacity: 0.6 }}>Pick a project to see contributions.</div>}
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
