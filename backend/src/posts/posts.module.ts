import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { PostsController } from './posts.controller';
import { PostsService } from './posts.service';
import { PostsProcessor } from './posts.processor';
import { GithubModule } from '../github/github.module';
import { OllamaModule } from '../ollama/ollama.module';
import { CommitsModule } from '../commits/commits.module';
import { AuthModule } from '../auth/auth.module';
import { GalleryModule } from '../gallery/gallery.module';
import { ComfyUIModule } from '../comfyui/comfyui.module';
import { POSTS_QUEUE } from './posts.constants';

export { POSTS_QUEUE };

@Module({
  imports: [
    BullModule.registerQueue({ name: POSTS_QUEUE }),
    GithubModule,
    OllamaModule,
    CommitsModule,
    AuthModule,
    GalleryModule,
    ComfyUIModule,
  ],
  controllers: [PostsController],
  providers: [PostsService, PostsProcessor],
  exports: [PostsService, BullModule],
})
export class PostsModule {}
