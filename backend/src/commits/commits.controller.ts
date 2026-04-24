import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { User } from '@prisma/client';
import { CommitsService } from './commits.service';

@UseGuards(JwtAuthGuard)
@Controller('projects/:projectId/commits')
export class CommitsController {
  constructor(private readonly commits: CommitsService) {}

  @Get()
  list(
    @CurrentUser() user: User,
    @Param('projectId') projectId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('take') take?: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.commits.listCommits(user.id, projectId, {
      from,
      to,
      take: take ? Number(take) : undefined,
      cursor,
    });
  }

  @Post('sync')
  sync(
    @CurrentUser() user: User,
    @Param('projectId') projectId: string,
    @Body() body: { since?: string; until?: string; perPage?: number; page?: number; branch?: string } = {},
  ) {
    return this.commits.syncRange(user.id, projectId, body);
  }

  @Get('aggregates')
  daily(
    @CurrentUser() user: User,
    @Param('projectId') projectId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.commits.getDailyAggregates(user.id, projectId, from, to);
  }

  @Get(':sha')
  detail(
    @CurrentUser() user: User,
    @Param('projectId') projectId: string,
    @Param('sha') sha: string,
  ) {
    return this.commits.ensureCommitDetail(user.id, projectId, sha);
  }
}
