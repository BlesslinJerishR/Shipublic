export interface User {
  id: string;
  username: string;
  name: string | null;
  email: string | null;
  avatarUrl: string | null;
}

export interface Project {
  id: string;
  userId: string;
  githubRepoId: string;
  owner: string;
  name: string;
  fullName: string;
  defaultBranch: string;
  description: string | null;
  private: boolean;
  autoSync: boolean;
  webhookId: string | null;
  lastSyncedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RepoSummary {
  id: number;
  name: string;
  fullName: string;
  owner: string;
  description: string | null;
  defaultBranch: string;
  private: boolean;
  pushedAt: string | null;
  stars: number;
  language: string | null;
}

export interface Commit {
  id: string;
  projectId: string;
  sha: string;
  message: string;
  authorName: string | null;
  authorEmail: string | null;
  authoredAt: string;
  url: string | null;
  additions: number;
  deletions: number;
  filesChanged: number;
  diffPreview: string | null;
  summary: string | null;
}

export type PostPlatform = 'TWITTER' | 'LINKEDIN' | 'GENERIC';
export type PostStatus = 'DRAFT' | 'SCHEDULED' | 'PUBLISHED' | 'FAILED';

export interface Post {
  id: string;
  userId: string;
  projectId: string;
  title: string | null;
  content: string;
  summary: string | null;
  platform: PostPlatform;
  status: PostStatus;
  scheduledFor: string | null;
  publishedAt: string | null;
  commitShas: string[];
  rangeFrom: string | null;
  rangeTo: string | null;
  metadata: any;
  createdAt: string;
  updatedAt: string;
}

export interface ContributionDay {
  date: string;
  contributionCount: number;
  color: string;
}
export interface ContributionWeek { contributionDays: ContributionDay[]; }
export interface ContributionCalendar {
  totalContributions: number;
  weeks: ContributionWeek[];
}

export interface DailyAgg { date: string; count: number; }
