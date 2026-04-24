import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GithubService } from '../github/github.service';

@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly github: GithubService,
  ) {}

  async listMyProjects(userId: string) {
    const list = await this.prisma.project.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
    });
    return list.map((p) => ({ ...p, githubRepoId: p.githubRepoId.toString(), webhookId: p.webhookId?.toString() ?? null }));
  }

  async listAvailableRepos(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('user');
    return this.github.listRepos(user.accessToken);
  }

  async addProject(userId: string, githubRepoId: number) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('user');
    const repos = await this.github.listRepos(user.accessToken);
    const repo = repos.find((r) => r.id === githubRepoId);
    if (!repo) throw new BadRequestException('Repository not accessible');
    const created = await this.prisma.project.upsert({
      where: { githubRepoId: BigInt(repo.id) },
      create: {
        userId,
        githubRepoId: BigInt(repo.id),
        owner: repo.owner,
        name: repo.name,
        fullName: repo.fullName,
        defaultBranch: repo.defaultBranch,
        description: repo.description ?? undefined,
        private: repo.private,
      },
      update: {
        userId,
        owner: repo.owner,
        name: repo.name,
        fullName: repo.fullName,
        defaultBranch: repo.defaultBranch,
        description: repo.description ?? undefined,
        private: repo.private,
      },
    });
    return this.serialize(created);
  }

  async getProject(userId: string, projectId: string) {
    const p = await this.prisma.project.findFirst({
      where: { id: projectId, userId },
    });
    if (!p) throw new NotFoundException('project');
    return this.serialize(p);
  }

  async removeProject(userId: string, projectId: string) {
    const p = await this.prisma.project.findFirst({ where: { id: projectId, userId } });
    if (!p) throw new NotFoundException('project');
    if (p.autoSync && p.webhookId) {
      const user = await this.prisma.user.findUnique({ where: { id: userId } });
      if (user) {
        await this.github.deleteWebhook(user.accessToken, p.owner, p.name, Number(p.webhookId));
      }
    }
    await this.prisma.project.delete({ where: { id: p.id } });
    return { ok: true };
  }

  async setAutoSync(userId: string, projectId: string, enabled: boolean) {
    const project = await this.prisma.project.findFirst({ where: { id: projectId, userId } });
    if (!project) throw new NotFoundException('project');
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('user');

    const apiBase = process.env.API_BASE_URL || 'http://localhost:4000';
    const secret = process.env.GITHUB_WEBHOOK_SECRET || 'dev-webhook-secret';
    const deliveryUrl = `${apiBase}/api/webhooks/github`;

    let webhookId = project.webhookId ? Number(project.webhookId) : null;

    if (enabled) {
      try {
        webhookId = await this.github.ensureWebhook(
          user.accessToken,
          project.owner,
          project.name,
          deliveryUrl,
          secret,
        );
      } catch (e: any) {
        throw new BadRequestException(`Failed to install webhook: ${e?.message}`);
      }
    } else if (webhookId) {
      await this.github.deleteWebhook(user.accessToken, project.owner, project.name, webhookId);
      webhookId = null;
    }

    const updated = await this.prisma.project.update({
      where: { id: project.id },
      data: { autoSync: enabled, webhookId: webhookId ? BigInt(webhookId) : null },
    });
    return this.serialize(updated);
  }

  private serialize(p: any) {
    return {
      ...p,
      githubRepoId: p.githubRepoId.toString(),
      webhookId: p.webhookId ? p.webhookId.toString() : null,
    };
  }
}
