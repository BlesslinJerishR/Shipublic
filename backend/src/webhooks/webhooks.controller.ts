import {
  BadRequestException,
  Controller,
  Headers,
  HttpCode,
  Post,
  Req,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CommitsService } from '../commits/commits.service';
import { PostsService } from '../posts/posts.service';

@Controller('webhooks')
export class WebhooksController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly commits: CommitsService,
    private readonly posts: PostsService,
  ) {}

  @Post('github')
  @HttpCode(202)
  async github(
    @Req() req: any,
    @Headers('x-hub-signature-256') signature: string,
    @Headers('x-github-event') event: string,
  ) {
    const secret = process.env.GITHUB_WEBHOOK_SECRET || 'dev-webhook-secret';
    const raw = req.rawBody ?? Buffer.from(JSON.stringify(req.body || {}));
    const expected =
      'sha256=' + crypto.createHmac('sha256', secret).update(raw).digest('hex');
    // timingSafeEqual throws on mismatched buffer lengths, which would
    // otherwise leak as a 500. Bail out cleanly first, then constant-time
    // compare.
    const sigBuf = Buffer.from(signature || '');
    const expBuf = Buffer.from(expected);
    if (
      !signature ||
      sigBuf.length !== expBuf.length ||
      !crypto.timingSafeEqual(sigBuf, expBuf)
    ) {
      throw new BadRequestException('Invalid signature');
    }

    if (event !== 'push') return { ignored: true };
    const body = req.body || {};
    const repoId: number | undefined = body?.repository?.id;
    if (!repoId) return { ignored: true };
    const project = await this.prisma.project.findUnique({
      where: { githubRepoId: BigInt(repoId) },
    });
    if (!project || !project.autoSync) return { ignored: true };

    const pushedShas: string[] =
      (body.commits || []).map((c: any) => c.id).filter(Boolean) ?? [];
    if (!pushedShas.length) return { ignored: true };

    await this.commits.syncRange(project.userId, project.id, { perPage: 50 });
    await this.posts.enqueueGeneration(project.userId, {
      projectId: project.id,
      commitShas: pushedShas,
      platform: 'GENERIC',
    });

    return { ok: true, queued: pushedShas.length };
  }
}
