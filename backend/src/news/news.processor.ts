/**
 * Background worker for AI News Gen.
 *
 * Pipeline:
 *   1. Hydrate the selected NewsItems
 *   2. Coder model condenses them into a structured editorial brief
 *   3. Chat model rewrites the brief as a platform-appropriate post
 *   4. Optionally: Ollama writes a Stable Diffusion prompt → ComfyUI renders
 *      a unique background → upload as a GalleryAsset → use it for the
 *      gallery image. If ComfyUI is not configured, the user's default
 *      background is used instead (graceful degradation).
 *   5. Render the final post image via the existing GalleryService.
 */

import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';

import { PrismaService } from '../prisma/prisma.service';
import { OllamaService } from '../ollama/ollama.service';
import { GalleryService } from '../gallery/gallery.service';
import { ComfyUIService } from '../comfyui/comfyui.service';
import { NEWS_QUEUE } from './news.constants';

interface NewsJobData {
  postId: string;
  userId: string;
  newsItemIds: string[];
  platform: 'TWITTER' | 'LINKEDIN' | 'GENERIC';
  tone: string;
  assetId: string | null;
}

@Processor(NEWS_QUEUE, { concurrency: 1 })
export class NewsProcessor extends WorkerHost {
  private readonly logger = new Logger(NewsProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ollama: OllamaService,
    private readonly gallery: GalleryService,
    private readonly comfy: ComfyUIService,
  ) {
    super();
  }

  async process(job: Job<NewsJobData>): Promise<void> {
    const { postId, userId, newsItemIds, platform, tone, assetId } = job.data;
    this.logger.log(`Generating news post ${postId} for ${newsItemIds.length} items`);

    try {
      const items = await this.prisma.newsItem.findMany({
        where: { userId, id: { in: newsItemIds } },
        orderBy: [{ publishedAt: 'desc' }],
      });
      if (!items.length) throw new Error('no news items found');

      // News headlines are already short, structured prose — there is no
      // diff to read — so we skip the coder "summarize" step entirely and
      // hand the items straight to the chat model. Faster, cheaper, and
      // avoids drift between two sequential LLM calls.
      const content = await this.ollama.polishToNewsPost(
        items.map((i) => ({
          title: i.title,
          snippet: i.snippet,
          link: i.link,
          sourceName: i.sourceName,
          publishedAt: i.publishedAt?.toISOString() || null,
        })),
        platform,
        tone,
      );

      // Mark source items as USED + update post body atomically so a partial
      // failure between the two writes can never leave the UI showing
      // "generating…" forever with the news items already consumed.
      await this.prisma.$transaction([
        this.prisma.newsItem.updateMany({
          where: { id: { in: items.map((i) => i.id) } },
          data: { status: 'USED' },
        }),
        this.prisma.post.update({
          where: { id: postId },
          data: {
            content: content.trim(),
            metadata: {
              tone,
              generating: false,
              completedAt: new Date().toISOString(),
              source: 'ai-news',
              sources: items.map((i) => ({ id: i.id, title: i.title, link: i.link, sourceName: i.sourceName })),
            },
          },
        }),
      ]);

      // Page 1: render the post text on top of the user's chosen / default
      // background. Caller-supplied assetId wins; otherwise GalleryService
      // falls back to the user's default. Failure is non-fatal.
      try {
        await this.gallery.generateForPost(userId, {
          postId,
          assetId: assetId ?? null,
        });
      } catch (err: any) {
        this.logger.warn(`page-1 (text+bg) render failed for news post ${postId}: ${err?.message}`);
      }

      // Page 2: optional AI-generated illustration. Stored as a SEPARATE
      // GalleryImage row (kind='AI_IMAGE') — never composited into page 1.
      if (this.comfy.available) {
        try {
          const prompt = await this.ollama.imagePromptFor(items[0].title);
          const png = await this.comfy.generateBackground(prompt);
          if (png?.data?.length) {
            await this.gallery.saveAiImageForPost(
              userId,
              postId,
              png.data,
              items[0].title,
            );
          }
        } catch (err: any) {
          this.logger.warn(`ComfyUI page-2 failed for news post ${postId}: ${err?.message}`);
        }
      }
    } catch (err: any) {
      this.logger.error(`News post ${postId} generation failed: ${err?.message}`);
      await this.prisma.post.update({
        where: { id: postId },
        data: {
          status: 'FAILED',
          metadata: { error: String(err?.message ?? err), generating: false, source: 'ai-news' },
        },
      });
      throw err;
    }
  }
}
