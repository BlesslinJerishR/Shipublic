import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { User } from '@prisma/client';
import { ProjectsService } from './projects.service';
import { GithubService } from '../github/github.service';

@UseGuards(JwtAuthGuard)
@Controller('projects')
export class ProjectsController {
  constructor(
    private readonly projects: ProjectsService,
    private readonly github: GithubService,
  ) {}

  @Get()
  list(@CurrentUser() user: User) {
    return this.projects.listMyProjects(user.id);
  }

  @Get('available')
  available(@CurrentUser() user: User) {
    return this.projects.listAvailableRepos(user.id);
  }

  @Post()
  add(@CurrentUser() user: User, @Body() body: { githubRepoId: number }) {
    return this.projects.addProject(user.id, Number(body.githubRepoId));
  }

  @Get(':id')
  get(@CurrentUser() user: User, @Param('id') id: string) {
    return this.projects.getProject(user.id, id);
  }

  @Delete(':id')
  remove(@CurrentUser() user: User, @Param('id') id: string) {
    return this.projects.removeProject(user.id, id);
  }

  @Patch(':id/auto-sync')
  setAutoSync(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() body: { enabled: boolean },
  ) {
    return this.projects.setAutoSync(user.id, id, !!body.enabled);
  }

  @Get(':id/contributions')
  async contributions(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    await this.projects.getProject(user.id, id);
    return this.github.getContributionCalendar(
      user.accessToken,
      user.username,
      from,
      to,
    );
  }
}
