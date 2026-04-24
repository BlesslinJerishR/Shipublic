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
import type { User, PostPlatform, PostStatus } from '@prisma/client';
import { PostsService } from './posts.service';

@UseGuards(JwtAuthGuard)
@Controller('posts')
export class PostsController {
  constructor(private readonly posts: PostsService) {}

  @Get()
  list(@CurrentUser() user: User, @Query('projectId') projectId?: string) {
    return this.posts.list(user.id, projectId);
  }

  @Get(':id')
  get(@CurrentUser() user: User, @Param('id') id: string) {
    return this.posts.get(user.id, id);
  }

  @Post('generate')
  generate(
    @CurrentUser() user: User,
    @Body()
    body: {
      projectId: string;
      commitShas?: string[];
      rangeFrom?: string;
      rangeTo?: string;
      platform?: PostPlatform;
      tone?: string;
    },
  ) {
    return this.posts.enqueueGeneration(user.id, body);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body()
    body: {
      content?: string;
      title?: string | null;
      summary?: string | null;
      status?: PostStatus;
      platform?: PostPlatform;
      scheduledFor?: string | null;
    },
  ) {
    return this.posts.update(user.id, id, body);
  }

  @Delete(':id')
  remove(@CurrentUser() user: User, @Param('id') id: string) {
    return this.posts.remove(user.id, id);
  }
}
