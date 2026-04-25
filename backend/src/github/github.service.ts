import { Injectable, Logger } from '@nestjs/common';
import { Octokit } from '@octokit/rest';

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

export interface CommitSummary {
  sha: string;
  message: string;
  authorName: string | null;
  authorEmail: string | null;
  authoredAt: string;
  url: string;
}

export interface CommitDetail extends CommitSummary {
  additions: number;
  deletions: number;
  filesChanged: number;
  diff: string;
}

// Calendar lookups are expensive (a full GraphQL fan-out on GitHub's side)
// and don't change often. Memoize per (user, range) for a few minutes so
// dashboard re-loads and overview widgets reuse the same payload.
const CALENDAR_TTL_MS = 5 * 60_000;
const CALENDAR_MAX = 500;
const calendarCache = new Map<string, { value: any; expires: number }>();

@Injectable()
export class GithubService {
  private readonly logger = new Logger(GithubService.name);
  // Avoid allocating a fresh Octokit (and its retry/throttle plumbing) per
  // request; a small per-token map covers the common single-user-per-process
  // pattern in dev and is bounded for multi-user prod.
  private readonly octCache = new Map<string, { client: Octokit; expires: number }>();
  private static readonly OCT_TTL_MS = 10 * 60_000;
  private static readonly OCT_MAX = 200;

  client(token: string) {
    const now = Date.now();
    const hit = this.octCache.get(token);
    if (hit && hit.expires > now) return hit.client;
    if (this.octCache.size >= GithubService.OCT_MAX) {
      const first = this.octCache.keys().next().value;
      if (first) this.octCache.delete(first);
    }
    const client = new Octokit({ auth: token, userAgent: 'Shipublic/0.1' });
    this.octCache.set(token, { client, expires: now + GithubService.OCT_TTL_MS });
    return client;
  }

  async listRepos(token: string): Promise<RepoSummary[]> {
    const oct = this.client(token);
    const repos: RepoSummary[] = [];
    let page = 1;
    while (page <= 5) {
      const { data } = await oct.repos.listForAuthenticatedUser({
        per_page: 100,
        page,
        sort: 'pushed',
        affiliation: 'owner,collaborator,organization_member',
      });
      if (!data.length) break;
      for (const r of data) {
        repos.push({
          id: r.id,
          name: r.name,
          fullName: r.full_name,
          owner: r.owner.login,
          description: r.description,
          defaultBranch: r.default_branch || 'main',
          private: r.private,
          pushedAt: r.pushed_at,
          stars: r.stargazers_count || 0,
          language: r.language,
        });
      }
      if (data.length < 100) break;
      page++;
    }
    return repos;
  }

  async listCommits(
    token: string,
    owner: string,
    repo: string,
    opts: { since?: string; until?: string; perPage?: number; page?: number; sha?: string } = {},
  ): Promise<CommitSummary[]> {
    const oct = this.client(token);
    const { data } = await oct.repos.listCommits({
      owner,
      repo,
      since: opts.since,
      until: opts.until,
      per_page: opts.perPage ?? 50,
      page: opts.page ?? 1,
      sha: opts.sha,
    });
    return data.map((c) => ({
      sha: c.sha,
      message: c.commit.message,
      authorName: c.commit.author?.name ?? null,
      authorEmail: c.commit.author?.email ?? null,
      authoredAt: c.commit.author?.date ?? new Date().toISOString(),
      url: c.html_url,
    }));
  }

  async getCommitDetail(
    token: string,
    owner: string,
    repo: string,
    sha: string,
  ): Promise<CommitDetail> {
    const oct = this.client(token);
    const { data } = await oct.repos.getCommit({ owner, repo, ref: sha });
    const files = data.files || [];
    const diffParts: string[] = [];
    let diffBudget = 12000;
    for (const f of files) {
      const header = `diff --git a/${f.filename} b/${f.filename}\n`;
      const patch = (f as any).patch ? String((f as any).patch) : '';
      const piece = header + patch + '\n';
      if (piece.length > diffBudget) {
        diffParts.push(piece.slice(0, diffBudget) + '\n... [truncated]');
        diffBudget = 0;
        break;
      }
      diffParts.push(piece);
      diffBudget -= piece.length;
    }
    return {
      sha: data.sha,
      message: data.commit.message,
      authorName: data.commit.author?.name ?? null,
      authorEmail: data.commit.author?.email ?? null,
      authoredAt: data.commit.author?.date ?? new Date().toISOString(),
      url: data.html_url,
      additions: data.stats?.additions ?? 0,
      deletions: data.stats?.deletions ?? 0,
      filesChanged: files.length,
      diff: diffParts.join('\n'),
    };
  }

  async getContributionCalendar(
    token: string,
    username: string,
    from?: string,
    to?: string,
  ) {
    const cacheKey = `${username}|${from ?? ''}|${to ?? ''}`;
    const now = Date.now();
    const hit = calendarCache.get(cacheKey);
    if (hit && hit.expires > now) return hit.value;

    const oct = this.client(token);
    const query = `query($login:String!,$from:DateTime,$to:DateTime){
      user(login:$login){
        contributionsCollection(from:$from,to:$to){
          contributionCalendar{
            totalContributions
            weeks{ contributionDays{ date contributionCount color } }
          }
        }
      }
    }`;
    try {
      const res: any = await oct.graphql(query, { login: username, from, to });
      const value = res.user.contributionsCollection.contributionCalendar;
      if (calendarCache.size >= CALENDAR_MAX) {
        const first = calendarCache.keys().next().value;
        if (first) calendarCache.delete(first);
      }
      calendarCache.set(cacheKey, { value, expires: now + CALENDAR_TTL_MS });
      return value;
    } catch (e: any) {
      this.logger.warn(`contribution calendar failed: ${e?.message}`);
      return { totalContributions: 0, weeks: [] };
    }
  }

  async ensureWebhook(
    token: string,
    owner: string,
    repo: string,
    deliveryUrl: string,
    secret: string,
  ): Promise<number> {
    const oct = this.client(token);
    const { data: hooks } = await oct.repos.listWebhooks({ owner, repo });
    const existing = hooks.find(
      (h) => (h.config as any)?.url === deliveryUrl,
    );
    if (existing) return existing.id;
    const { data: created } = await oct.repos.createWebhook({
      owner,
      repo,
      events: ['push'],
      active: true,
      config: {
        url: deliveryUrl,
        content_type: 'json',
        secret,
        insecure_ssl: '0',
      } as any,
    });
    return created.id;
  }

  async deleteWebhook(token: string, owner: string, repo: string, hookId: number) {
    const oct = this.client(token);
    try {
      await oct.repos.deleteWebhook({ owner, repo, hook_id: hookId });
    } catch (e: any) {
      this.logger.warn(`deleteWebhook ${owner}/${repo} ${hookId}: ${e?.message}`);
    }
  }
}
