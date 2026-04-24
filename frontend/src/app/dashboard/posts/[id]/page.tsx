'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Save,
  Send,
  Trash2,
  RefreshCw,
  Calendar,
  Copy,
  Check,
  ArrowLeft,
} from 'lucide-react';
import { Card } from '@/components/Card';
import { api } from '@/lib/api';
import type { Post } from '@/lib/types';
import styles from './post.module.css';

export default function PostDetail() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [post, setPost] = useState<Post | null>(null);
  const [content, setContent] = useState('');
  const [platform, setPlatform] = useState<'TWITTER' | 'LINKEDIN' | 'GENERIC'>('GENERIC');
  const [scheduledFor, setScheduledFor] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const pollRef = useRef<any>(null);

  const load = async () => {
    const p = (await api.posts.get(id)) as Post;
    setPost(p);
    setContent(p.content || '');
    setPlatform(p.platform);
    setScheduledFor(p.scheduledFor ? p.scheduledFor.substring(0, 16) : '');
    if (p.metadata?.generating) {
      pollRef.current = setTimeout(load, 2500);
    }
  };

  useEffect(() => {
    load();
    return () => { if (pollRef.current) clearTimeout(pollRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const save = async () => {
    setSaving(true);
    try {
      const updated = await api.posts.update(id, {
        content,
        platform,
        scheduledFor: scheduledFor ? new Date(scheduledFor).toISOString() : null,
      });
      setPost(updated as Post);
    } finally { setSaving(false); }
  };

  const markPublished = async () => {
    const updated = await api.posts.update(id, {
      status: 'PUBLISHED',
    });
    setPost(updated as Post);
  };

  const schedule = async () => {
    if (!scheduledFor) { alert('Pick a date and time.'); return; }
    const updated = await api.posts.update(id, {
      status: 'SCHEDULED',
      scheduledFor: new Date(scheduledFor).toISOString(),
    });
    setPost(updated as Post);
  };

  const remove = async () => {
    if (!confirm('Delete this post?')) return;
    await api.posts.remove(id);
    router.push('/dashboard/posts');
  };

  const copy = async () => {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  if (!post) return <div style={{ opacity: 0.6 }}>Loading post</div>;

  const generating = post.metadata?.generating;

  return (
    <div>
      <div className={styles.head}>
        <button onClick={() => router.back()}><ArrowLeft size={14} /> Back</button>
        <div className={styles.row}>
          <span className={styles.statusBadge}>{post.status.toLowerCase()}</span>
          {generating && <span className={`${styles.statusBadge} ${styles.statusOn}`}><RefreshCw size={11} /> generating</span>}
        </div>
      </div>

      <div className={styles.grid}>
        <Card title="Post content"
          action={
            <div className={styles.row}>
              <button onClick={copy}>{copied ? <><Check size={14} /> copied</> : <><Copy size={14} /> copy</>}</button>
            </div>
          }>
          <div className={styles.editor}>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={generating ? 'Generating with Ollama...' : 'Write your post'}
              disabled={generating}
            />
            <div style={{ fontSize: 12, opacity: 0.6, marginTop: 6 }}>
              {content.length} characters
            </div>
          </div>

          <div className={styles.row} style={{ marginTop: 12 }}>
            <div>
              <div className={styles.label}>Platform</div>
              <select value={platform} onChange={(e) => setPlatform(e.target.value as any)}>
                <option value="GENERIC">Generic</option>
                <option value="TWITTER">Twitter</option>
                <option value="LINKEDIN">LinkedIn</option>
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <div className={styles.label}>Scheduled for</div>
              <input
                type="datetime-local"
                value={scheduledFor}
                onChange={(e) => setScheduledFor(e.target.value)}
              />
            </div>
          </div>

          <div className={styles.row} style={{ marginTop: 14 }}>
            <button className="heroBtn" onClick={save} disabled={saving || generating}>
              <Save size={14} /> {saving ? 'Saving' : 'Save draft'}
            </button>
            <button onClick={schedule} disabled={!scheduledFor || generating}>
              <Calendar size={14} /> Schedule
            </button>
            <button onClick={markPublished} disabled={generating}>
              <Send size={14} /> Mark published
            </button>
            <button onClick={remove} title="Delete">
              <Trash2 size={14} />
            </button>
          </div>
        </Card>

        <Card title="AI structured summary">
          {post.summary ? (
            <pre className={styles.summary}>{post.summary}</pre>
          ) : (
            <div style={{ opacity: 0.6 }}>
              {generating ? 'Coder model is reading the diffs.' : 'No summary attached.'}
            </div>
          )}
          <div style={{ marginTop: 12, fontSize: 12, opacity: 0.6 }}>
            Commits used: {post.commitShas.length}
          </div>
        </Card>
      </div>
    </div>
  );
}
