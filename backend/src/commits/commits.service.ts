import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GithubService } from '../github/github.service';

@Injectable()
export class CommitsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly github: GithubService,
  ) {}

  async syncRange(
    userId: string,
    projectId: string,
    opts: { since?: string; until?: string; perPage?: number; page?: number; branch?: string } = {},
  ) {
    const project = await this.prisma.project.findFirst({ where: { id: projectId, userId } });
    if (!project) throw new NotFoundException('project');
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('user');

    const list = await this.github.listCommits(user.accessToken, project.owner, project.name, {
      since: opts.since,
      until: opts.until,
      perPage: opts.perPage ?? 50,
      page: opts.page ?? 1,
      sha: opts.branch,
    });

    const written = [] as any[];
    for (const c of list) {
      const up = await this.prisma.commit.upsert({
        where: { projectId_sha: { projectId: project.id, sha: c.sha } },
        create: {
          projectId: project.id,
          sha: c.sha,
          message: c.message,
          authorName: c.authorName ?? undefined,
          authorEmail: c.authorEmail ?? undefined,
          authoredAt: new Date(c.authoredAt),
          url: c.url,
        },
        update: {
          message: c.message,
          authorName: c.authorName ?? undefined,
          authorEmail: c.authorEmail ?? undefined,
          authoredAt: new Date(c.authoredAt),
          url: c.url,
        },
      });
      written.push(up);
    }
    await this.prisma.project.update({
      where: { id: project.id },
      data: { lastSyncedAt: new Date() },
    });
    return { synced: written.length };
  }

  async listCommits(
    userId: string,
    projectId: string,
    opts: { from?: string; to?: string; take?: number; cursor?: string } = {},
  ) {
    const project = await this.prisma.project.findFirst({ where: { id: projectId, userId } });
    if (!project) throw new NotFoundException('project');
    const where: any = { projectId };
    if (opts.from || opts.to) {
      where.authoredAt = {};
      if (opts.from) where.authoredAt.gte = new Date(opts.from);
      if (opts.to) where.authoredAt.lte = new Date(opts.to);
    }
    const list = await this.prisma.commit.findMany({
      where,
      orderBy: { authoredAt: 'desc' },
      take: Math.min(opts.take ?? 100, 200),
      ...(opts.cursor ? { skip: 1, cursor: { id: opts.cursor } } : {}),
    });
    return list;
  }

  async getDailyAggregates(userId: string, projectId: string, from?: string, to?: string) {
    const project = await this.prisma.project.findFirst({ where: { id: projectId, userId } });
    if (!project) throw new NotFoundException('project');
    const where: any = { projectId };
    if (from || to) {
      where.authoredAt = {};
      if (from) where.authoredAt.gte = new Date(from);
      if (to) where.authoredAt.lte = new Date(to);
    }
    const commits = await this.prisma.commit.findMany({ where, select: { authoredAt: true } });
    const byDay = new Map<string, number>();
    for (const c of commits) {
      const d = c.authoredAt.toISOString().substring(0, 10);
      byDay.set(d, (byDay.get(d) || 0) + 1);
    }
    return Array.from(byDay.entries()).map(([date, count]) => ({ date, count }));
  }

  async ensureCommitDetail(userId: string, projectId: string, sha: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    const project = await this.prisma.project.findFirst({ where: { id: projectId, userId } });
    if (!user || !project) throw new NotFoundException();
    const existing = await this.prisma.commit.findUnique({
      where: { projectId_sha: { projectId: project.id, sha } },
    });
    if (existing && existing.diffPreview) return existing;
    const detail = await this.github.getCommitDetail(user.accessToken, project.owner, project.name, sha);
    return this.prisma.commit.upsert({
      where: { projectId_sha: { projectId: project.id, sha: detail.sha } },
      create: {
        projectId: project.id,
        sha: detail.sha,
        message: detail.message,
        authorName: detail.authorName ?? undefined,
        authorEmail: detail.authorEmail ?? undefined,
        authoredAt: new Date(detail.authoredAt),
        url: detail.url,
        additions: detail.additions,
        deletions: detail.deletions,
        filesChanged: detail.filesChanged,
        diffPreview: detail.diff,
      },
      update: {
        additions: detail.additions,
        deletions: detail.deletions,
        filesChanged: detail.filesChanged,
        diffPreview: detail.diff,
      },
    });
  }
}
