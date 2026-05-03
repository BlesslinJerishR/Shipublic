import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';

import { NewsController } from './news.controller';
import { NewsService } from './news.service';
import { NewsProcessor } from './news.processor';
import { RssService } from './rss.service';
import { ComfyUIModule } from '../comfyui/comfyui.module';
import { OllamaModule } from '../ollama/ollama.module';
import { GalleryModule } from '../gallery/gallery.module';
import { AuthModule } from '../auth/auth.module';
import { NEWS_QUEUE } from './news.constants';

export { NEWS_QUEUE };

@Module({
  imports: [
    BullModule.registerQueue({ name: NEWS_QUEUE }),
    OllamaModule,
    GalleryModule,
    AuthModule,
    ComfyUIModule,
  ],
  controllers: [NewsController],
  providers: [NewsService, NewsProcessor, RssService],
  exports: [NewsService],
})
export class NewsModule {}
