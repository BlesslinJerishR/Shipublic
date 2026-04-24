import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { CommitsService } from '../commits/commits.service';
import type { PostPlatform, PostStatus } from '@prisma/client';
import { POSTS_QUEUE } from './posts.module';

export interface GeneratePostInput {
  projectId: string;
  commitShas?: string[];
  rangeFrom?: string;
  rangeTo?: string;
  platform?: PostPlatform;
  tone?: string;
}

@Injectable()
export class PostsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly commits: CommitsService,
    @InjectQueue(POSTS_QUEUE) private readonly queue: Queue,
  ) {}

  async list(userId: string, projectId?: string) {
    return this.prisma.post.findMany({
      where: { userId, ...(projectId ? { projectId } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  async get(userId: string, id: string) {
    const post = await this.prisma.post.findFirst({ where: { id, userId } });
    if (!post) throw new NotFoundException('post');
    return post;
  }

  async update(
    userId: string,
    id: string,
    data: {
      content?: string;
      title?: string | null;
      summary?: string | null;
      status?: PostStatus;
      platform?: PostPlatform;
      scheduledFor?: string | null;
    },
  ) {
    await this.get(userId, id);
    return this.prisma.post.update({
      where: { id },
      data: {
        ...(data.content !== undefined ? { content: data.content } : {}),
        ...(data.title !== undefined ? { title: data.title } : {}),
        ...(data.summary !== undefined ? { summary: data.summary } : {}),
        ...(data.status !== undefined ? { status: data.status } : {}),
        ...(data.platform !== undefined ? { platform: data.platform } : {}),
        ...(data.scheduledFor !== undefined
          ? { scheduledFor: data.scheduledFor ? new Date(data.scheduledFor) : null }
          : {}),
      },
    });
  }

  async remove(userId: string, id: string) {
    await this.get(userId, id);
    await this.prisma.post.delete({ where: { id } });
    return { ok: true };
  }

  async enqueueGeneration(userId: string, input: GeneratePostInput) {
    if (!input.projectId) throw new BadRequestException('projectId required');
    const project = await this.prisma.project.findFirst({
      where: { id: input.projectId, userId },
    });
    if (!project) throw new NotFoundException('project');

    let shas = input.commitShas ?? [];
    if (!shas.length) {
      if (!input.rangeFrom || !input.rangeTo) {
        throw new BadRequestException('Provide commitShas or rangeFrom/rangeTo');
      }
      const list = await this.prisma.commit.findMany({
        where: {
          projectId: project.id,
          authoredAt: {
            gte: new Date(input.rangeFrom),
            lte: new Date(input.rangeTo),
          },
        },
        orderBy: { authoredAt: 'asc' },
        take: 30,
      });
      shas = list.map((c) => c.sha);
    }
    if (!shas.length) throw new BadRequestException('No commits in range');

    const post = await this.prisma.post.create({
      data: {
        userId,
        projectId: project.id,
        content: '',
        platform: input.platform ?? 'GENERIC',
        status: 'DRAFT',
        commitShas: shas,
        rangeFrom: input.rangeFrom ? new Date(input.rangeFrom) : null,
        rangeTo: input.rangeTo ? new Date(input.rangeTo) : null,
        metadata: { tone: input.tone ?? 'engaging but not cringe', generating: true },
      },
    });

    await this.queue.add(
      'generate',
      {
        postId: post.id,
        userId,
        projectId: project.id,
        shas,
        platform: post.platform,
        tone: input.tone ?? 'engaging but not cringe',
      },
      {
        removeOnComplete: 100,
        removeOnFail: 50,
        attempts: 1,
      },
    );

    return post;
  }
}
