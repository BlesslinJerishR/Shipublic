import { Module } from '@nestjs/common';
import { WebhooksController } from './webhooks.controller';
import { CommitsModule } from '../commits/commits.module';
import { PostsModule } from '../posts/posts.module';

@Module({
  imports: [CommitsModule, PostsModule],
  controllers: [WebhooksController],
})
export class WebhooksModule {}
