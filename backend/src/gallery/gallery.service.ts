/**
 * Gallery service — owns the lifecycle of background assets, generated post
 * images, and per-user gallery defaults.
 *
 * Storage layout (under STORAGE_DIR):
 *   defaults/   bundled images shipped with the app (read-only)
 *   assets/     user-uploaded background images
 *   images/     rendered post images
 */

import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { randomBytes } from 'node:crypto';
import sharp from 'sharp';

import { PrismaService } from '../prisma/prisma.service';
import {
  ImageRendererService,
  RenderSpec,
} from './image-renderer.service';
import { getRatio, recommendedRatioFor } from './ratios';

const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/webp']);
const EXT_BY_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

export interface UploadAssetInput {
  name: string;
  mimeType: string;
  base64: string; // raw base64 (no data: prefix) or full data URL
}

export interface GenerateImageInput {
  postId: string;
  assetId?: string | null;
  ratio?: string;
  marginTopPct?: number;
  marginBottomPct?: number;
  marginLeftPct?: number;
  marginRightPct?: number;
  fontFamily?: string;
  fontSize?: number;
  fontColor?: string;
  textAlign?: 'left' | 'center' | 'right';
  verticalAlign?: 'start' | 'center' | 'end';
  bgFit?: 'cover' | 'contain';
  bgFillColor?: string;
  content?: string; // override; defaults to post.content
  offsetX?: number;
  offsetY?: number;
}

@Injectable()
export class GalleryService implements OnModuleInit {
  private readonly logger = new Logger(GalleryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly renderer: ImageRendererService,
  ) {}

  get storageDir(): string {
    return path.resolve(process.env.STORAGE_DIR || './storage');
  }

  get maxUploadBytes(): number {
    const n = Number(process.env.GALLERY_UPLOAD_MAX_BYTES || 8 * 1024 * 1024);
    return Number.isFinite(n) && n > 0 ? n : 8 * 1024 * 1024;
  }

  async onModuleInit() {
    // Best-effort directory bootstrap. Failures are logged but don't crash the
    // app — file ops will surface a clearer error to the API caller.
    for (const sub of ['defaults', 'assets', 'images']) {
      try {
        await fs.mkdir(path.join(this.storageDir, sub), { recursive: true });
      } catch (e: any) {
        this.logger.warn(`Could not ensure ${sub} dir: ${e?.message}`);
      }
    }
  }

  // -------------------------------------------------------------------------
  // Settings
  // -------------------------------------------------------------------------

  async getSettings(userId: string) {
    // Atomic find-or-create. The previous find-then-create flow let two
    // concurrent first requests both miss and then race on the unique
    // (userId) constraint, surfacing as a 500 to the second caller.
    return this.prisma.gallerySettings.upsert({
      where: { userId },
      update: {},
      create: { userId },
    });
  }

  async updateSettings(
    userId: string,
    patch: Partial<Omit<Awaited<ReturnType<GalleryService['getSettings']>>, 'id' | 'userId' | 'createdAt' | 'updatedAt'>>,
  ) {
    const current = await this.getSettings(userId);
    if (patch.defaultAssetId) {
      const exists = await this.prisma.galleryAsset.findFirst({
        where: { id: patch.defaultAssetId, userId },
      });
      if (!exists) throw new BadRequestException('defaultAssetId not found');
    }
    return this.prisma.gallerySettings.update({
      where: { id: current.id },
      data: patch as any,
    });
  }

  // -------------------------------------------------------------------------
  // Assets
  // -------------------------------------------------------------------------

  async listAssets(userId: string) {
    return this.prisma.galleryAsset.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getAsset(userId: string, id: string) {
    const a = await this.prisma.galleryAsset.findFirst({ where: { id, userId } });
    if (!a) throw new NotFoundException('asset');
    return a;
  }

  async uploadAsset(userId: string, input: UploadAssetInput) {
    if (!input?.base64) throw new BadRequestException('base64 required');
    const raw = String(input.base64).replace(/^data:[^;]+;base64,/, '');
    let buf: Buffer;
    try {
      buf = Buffer.from(raw, 'base64');
    } catch {
      throw new BadRequestException('invalid base64');
    }
    if (!buf.length) throw new BadRequestException('empty file');
    if (buf.length > this.maxUploadBytes) {
      throw new BadRequestException(`file too large (max ${this.maxUploadBytes} bytes)`);
    }
    const mime = (input.mimeType || 'image/png').toLowerCase();
    if (!ALLOWED_MIME.has(mime)) {
      throw new BadRequestException(`unsupported mime ${mime}`);
    }
    let meta: sharp.Metadata;
    try {
      meta = await sharp(buf).metadata();
    } catch {
      throw new BadRequestException('not a valid image');
    }
    if (!meta.width || !meta.height) {
      throw new BadRequestException('image has no dimensions');
    }

    const id = `ga_${randomBytes(8).toString('hex')}`;
    const ext = EXT_BY_MIME[mime];
    const filename = `${id}.${ext}`;
    const abs = path.join(this.storageDir, 'assets', filename);
    await fs.writeFile(abs, buf);

    const asset = await this.prisma.galleryAsset.create({
      data: {
        id,
        userId,
        name: input.name?.slice(0, 120) || 'background',
        mimeType: mime,
        width: meta.width,
        height: meta.height,
        sizeBytes: buf.length,
        filename,
      },
    });

    // First upload becomes the user's default automatically.
    const settings = await this.getSettings(userId);
    if (!settings.defaultAssetId) {
      await this.prisma.gallerySettings.update({
        where: { id: settings.id },
        data: { defaultAssetId: asset.id },
      });
    }
    return asset;
  }

  async deleteAsset(userId: string, id: string) {
    const a = await this.getAsset(userId, id);
    if (a.isDefault) throw new BadRequestException('cannot delete bundled default');
    const abs = path.join(this.storageDir, 'assets', a.filename);
    await this.prisma.galleryAsset.delete({ where: { id } });
    try {
      await fs.unlink(abs);
    } catch {
      /* file may already be gone, ignore */
    }
    // Clear defaultAssetId on settings if it pointed here.
    const s = await this.prisma.gallerySettings.findUnique({ where: { userId } });
    if (s?.defaultAssetId === id) {
      await this.prisma.gallerySettings.update({
        where: { id: s.id },
        data: { defaultAssetId: null },
      });
    }
    return { ok: true };
  }

  async readAssetBytes(userId: string, id: string): Promise<{ data: Buffer; mime: string }> {
    const a = await this.getAsset(userId, id);
    const abs = path.join(this.storageDir, 'assets', a.filename);
    const data = await fs.readFile(abs);
    return { data, mime: a.mimeType };
  }

  // -------------------------------------------------------------------------
  // Images
  // -------------------------------------------------------------------------

  async listImages(userId: string, opts: { postId?: string } = {}) {
    const rows = await this.prisma.galleryImage.findMany({
      where: {
        userId,
        ...(opts.postId ? { postId: opts.postId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    // Deterministic page order per post:
    //   page 1 = AI_IMAGE (ComfyUI)
    //   page 2 = POST       (text on background)
    // The DB createdAt-desc fallback already produces this order in the
    // happy path (AI image is saved after the text composite), but we sort
    // explicitly here so the contract holds even when rows are re-rendered
    // out of order, which is critical for PDF/ZIP downloads grouped per post.
    const pageOf = (img: typeof rows[number]) => {
      const spec: any = img.spec || {};
      if (typeof spec.page === 'number') return spec.page;
      return spec.kind === 'AI_IMAGE' ? 1 : 2;
    };
    return rows.sort((a, b) => {
      if (a.postId && b.postId && a.postId === b.postId) {
        const pa = pageOf(a);
        const pb = pageOf(b);
        if (pa !== pb) return pa - pb;
      }
      return a.createdAt < b.createdAt ? 1 : -1;
    });
  }

  async getImage(userId: string, id: string) {
    const img = await this.prisma.galleryImage.findFirst({ where: { id, userId } });
    if (!img) throw new NotFoundException('image');
    return img;
  }

  async readImageBytes(userId: string, id: string) {
    const img = await this.getImage(userId, id);
    const abs = path.join(this.storageDir, 'images', img.filename);
    const data = await fs.readFile(abs);
    return { data, mime: img.mimeType };
  }

  async deleteImage(userId: string, id: string) {
    const img = await this.getImage(userId, id);
    const abs = path.join(this.storageDir, 'images', img.filename);
    await this.prisma.galleryImage.delete({ where: { id } });
    try {
      await fs.unlink(abs);
    } catch {
      /* ignore */
    }
    return { ok: true };
  }

  /**
   * Build a fully-resolved RenderSpec for a post by merging the user's
   * default settings, the post's existing render spec (if any), and the
   * caller's overrides — in that order.
   */
  private async buildSpecFor(
    userId: string,
    post: { id: string; content: string; platform: string },
    overrides: Omit<GenerateImageInput, 'postId'>,
  ): Promise<{ spec: RenderSpec; assetId: string | null; bgPath: string }> {
    const settings = await this.getSettings(userId);

    // Resolve background asset.
    let assetId: string | null = overrides.assetId ?? settings.defaultAssetId ?? null;
    let assetRow: { filename: string; isDefault: boolean } | null = null;
    if (assetId) {
      const a = await this.prisma.galleryAsset.findFirst({
        where: { id: assetId, userId },
      });
      if (a) {
        assetRow = { filename: a.filename, isDefault: a.isDefault };
      } else {
        assetId = null;
      }
    }
    const bgPath = this.renderer.resolveBgPath(this.storageDir, assetRow);

    // Fall back to platform-specific recommendation when no explicit ratio.
    const ratio =
      overrides.ratio ||
      settings.defaultRatio ||
      recommendedRatioFor(post.platform as any);
    const r = getRatio(ratio);

    const spec = this.renderer.normaliseSpec({
      ratio: r.id,
      marginTopPct: overrides.marginTopPct ?? settings.marginTopPct,
      marginBottomPct: overrides.marginBottomPct ?? settings.marginBottomPct,
      marginLeftPct: overrides.marginLeftPct ?? settings.marginLeftPct,
      marginRightPct: overrides.marginRightPct ?? settings.marginRightPct,
      fontFamily: overrides.fontFamily ?? settings.fontFamily,
      fontSize: overrides.fontSize ?? settings.fontSize,
      fontColor: overrides.fontColor ?? settings.fontColor,
      textAlign: (overrides.textAlign ?? settings.textAlign) as any,
      verticalAlign: (overrides.verticalAlign ?? settings.verticalAlign) as any,
      bgFit: (overrides.bgFit ?? settings.bgFit) as any,
      bgFillColor: overrides.bgFillColor ?? settings.bgFillColor,
      content: overrides.content ?? post.content ?? '',
      offsetX: overrides.offsetX,
      offsetY: overrides.offsetY,
    });

    return { spec, assetId, bgPath };
  }

  /** Render a fresh image for a post. Stores PNG to disk + DB row. */
  async generateForPost(userId: string, input: GenerateImageInput) {
    if (!input?.postId) throw new BadRequestException('postId required');
    const post = await this.prisma.post.findFirst({
      where: { id: input.postId, userId },
    });
    if (!post) throw new NotFoundException('post');
    if (!post.content?.trim() && !input.content?.trim()) {
      throw new BadRequestException('post has no content yet');
    }

    const { spec, assetId, bgPath } = await this.buildSpecFor(userId, post, input);

    const id = `gi_${randomBytes(8).toString('hex')}`;
    const filename = `${id}.png`;
    const abs = path.join(this.storageDir, 'images', filename);
    try {
      const result = await this.renderer.render({ ...spec, bgPath });
      await fs.writeFile(abs, result.png);
      const row = await this.prisma.galleryImage.create({
        data: {
          id,
          userId,
          postId: post.id,
          assetId,
          filename,
          mimeType: 'image/png',
          width: result.width,
          height: result.height,
          sizeBytes: result.png.length,
          spec: { ...(spec as any), kind: 'POST', page: 2 },
          status: 'READY',
        },
      });
      return row;
    } catch (err: any) {
      this.logger.error(`generate failed: ${err?.message}`);
      const row = await this.prisma.galleryImage.create({
        data: {
          id,
          userId,
          postId: post.id,
          assetId,
          filename,
          mimeType: 'image/png',
          width: spec.width,
          height: spec.height,
          sizeBytes: 0,
          spec: { ...(spec as any), kind: 'POST', page: 2 },
          status: 'FAILED',
        },
      });
      throw err instanceof Error ? err : new Error(String(err));
    }
  }

  /** Re-render an existing image with edits (overwrites the PNG in place). */
  async updateImage(
    userId: string,
    id: string,
    patch: Omit<GenerateImageInput, 'postId'>,
  ) {
    const img = await this.getImage(userId, id);
    if (!img.postId) throw new BadRequestException('image is not linked to a post');
    const post = await this.prisma.post.findFirst({
      where: { id: img.postId, userId },
    });
    if (!post) throw new NotFoundException('post');

    // Merge prior spec with the patch so the editor only needs to send deltas.
    const prior = (img.spec || {}) as Partial<RenderSpec>;
    const merged: Omit<GenerateImageInput, 'postId'> = {
      assetId: patch.assetId !== undefined ? patch.assetId : img.assetId,
      ratio: patch.ratio ?? prior.ratio,
      marginTopPct: patch.marginTopPct ?? prior.marginTopPct,
      marginBottomPct: patch.marginBottomPct ?? prior.marginBottomPct,
      marginLeftPct: patch.marginLeftPct ?? prior.marginLeftPct,
      marginRightPct: patch.marginRightPct ?? prior.marginRightPct,
      fontFamily: patch.fontFamily ?? prior.fontFamily,
      fontSize: patch.fontSize ?? prior.fontSize,
      fontColor: patch.fontColor ?? prior.fontColor,
      textAlign: (patch.textAlign ?? prior.textAlign) as any,
      verticalAlign: (patch.verticalAlign ?? prior.verticalAlign) as any,
      bgFit: (patch.bgFit ?? prior.bgFit) as any,
      bgFillColor: patch.bgFillColor ?? prior.bgFillColor,
      content: patch.content ?? prior.content,
      offsetX: patch.offsetX ?? prior.offsetX,
      offsetY: patch.offsetY ?? prior.offsetY,
    };
    const { spec, assetId, bgPath } = await this.buildSpecFor(userId, post, merged);

    const result = await this.renderer.render({ ...spec, bgPath });
    const abs = path.join(this.storageDir, 'images', img.filename);
    await fs.writeFile(abs, result.png);

    const priorKind = (img.spec as any)?.kind === 'AI_IMAGE' ? 'AI_IMAGE' : 'POST';
    const priorPage = (img.spec as any)?.page ?? (priorKind === 'AI_IMAGE' ? 1 : 2);
    return this.prisma.galleryImage.update({
      where: { id: img.id },
      data: {
        assetId,
        width: result.width,
        height: result.height,
        sizeBytes: result.png.length,
        spec: { ...(spec as any), kind: priorKind, page: priorPage },
        status: 'READY',
      },
    });
  }

  /**
   * Used by the posts BullMQ worker to auto-generate an image when a post's
   * content is freshly polished. Honours the user's autoGenerate flag and
   * never throws — image generation must not fail the post pipeline.
   */
  async autoGenerateForPost(userId: string, postId: string): Promise<void> {
    try {
      const settings = await this.getSettings(userId);
      if (!settings.autoGenerate) return;
      await this.generateForPost(userId, { postId });
    } catch (err: any) {
      this.logger.warn(`auto-generate skipped for post ${postId}: ${err?.message}`);
    }
  }

  /**
   * Persist a raw AI-generated PNG (e.g. ComfyUI output) as a SECOND
   * GalleryImage attached to the post. The bytes are written verbatim — no
   * text or background compositing is performed. The row is tagged
   * `spec.kind = 'AI_IMAGE'` so the UI can prefer it for the preview
   * thumbnail while still keeping the text+bg "post" image around for
   * editing and download.
   */
  async saveAiImageForPost(
    userId: string,
    postId: string,
    png: Buffer,
    label?: string,
  ): Promise<void> {
    if (!png?.length) return;
    try {
      // Probe dimensions so the row matches what the UI displays for the
      // primary image. Falls back to the env-configured ComfyUI defaults if
      // sharp can't decode for any reason.
      let width = Number(process.env.COMFYUI_WIDTH || 1024);
      let height = Number(process.env.COMFYUI_HEIGHT || 1280);
      try {
        const meta = await sharp(png).metadata();
        if (meta.width) width = meta.width;
        if (meta.height) height = meta.height;
      } catch {
        /* keep defaults */
      }
      const ratio = (() => {
        if (!width || !height) return 'INSTAGRAM_PORTRAIT';
        const r = width / height;
        if (r > 1.6) return 'TWITTER_LANDSCAPE';
        if (r > 1.05) return 'LINKEDIN_LANDSCAPE';
        if (r < 0.7) return 'STORY_VERTICAL';
        return 'INSTAGRAM_PORTRAIT';
      })();
      const id = `gi_${randomBytes(8).toString('hex')}`;
      const filename = `${id}.png`;
      const abs = path.join(this.storageDir, 'images', filename);
      await fs.writeFile(abs, png);
      await this.prisma.galleryImage.create({
        data: {
          id,
          userId,
          postId,
          assetId: null,
          filename,
          mimeType: 'image/png',
          width,
          height,
          sizeBytes: png.length,
          // Minimal valid spec so existing UI fields (ratio etc.) keep working,
          // plus a marker the frontend can switch on.
          spec: {
            kind: 'AI_IMAGE',
            page: 1,
            ratio,
            label: (label || '').slice(0, 200),
            generatedBy: 'comfyui',
          } as any,
          status: 'READY',
        },
      });
    } catch (err: any) {
      this.logger.warn(
        `saveAiImageForPost failed for post ${postId}: ${err?.message}`,
      );
    }
  }

  // -------------------------------------------------------------------------
  // Bundled downloads (PDF + ZIP)
  //
  // The two render passes for a post are exposed as a single artifact so the
  // user can grab "everything for this story" in one click. PDF concatenates
  // the pages in canonical order (page 1 = AI image, page 2 = text + bg).
  // ZIP groups by postId so multi-post bundles stay organized.
  // -------------------------------------------------------------------------

  /**
   * Resolve the ordered, ready-to-render pages for a single post. Throws
   * NotFoundException if the post has no usable images yet.
   */
  private async loadPostPages(userId: string, postId: string) {
    const post = await this.prisma.post.findFirst({
      where: { id: postId, userId },
    });
    if (!post) throw new NotFoundException('post');
    const images = await this.listImages(userId, { postId });
    const ready = images.filter((i) => i.status === 'READY');
    if (!ready.length) throw new NotFoundException('no images for post');
    const pages: Array<{
      page: number;
      kind: 'AI_IMAGE' | 'POST';
      bytes: Buffer;
      mime: string;
      width: number;
      height: number;
      filename: string;
    }> = [];
    for (const img of ready) {
      const spec: any = img.spec || {};
      const kind: 'AI_IMAGE' | 'POST' =
        spec.kind === 'AI_IMAGE' ? 'AI_IMAGE' : 'POST';
      const page = typeof spec.page === 'number'
        ? spec.page
        : (kind === 'AI_IMAGE' ? 1 : 2);
      try {
        const { data, mime } = await this.readImageBytes(userId, img.id);
        const ext = mime === 'image/jpeg' ? 'jpg' : (mime === 'image/webp' ? 'webp' : 'png');
        pages.push({
          page,
          kind,
          bytes: data,
          mime,
          width: img.width,
          height: img.height,
          filename: `page-${page}-${kind === 'AI_IMAGE' ? 'ai' : 'post'}.${ext}`,
        });
      } catch (err: any) {
        this.logger.warn(
          `loadPostPages: skip image ${img.id}: ${err?.message}`,
        );
      }
    }
    pages.sort((a, b) => a.page - b.page);
    if (!pages.length) throw new NotFoundException('no readable image bytes');
    const slug = (post.title || post.id || 'post')
      .toString()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')
      .slice(0, 60) || post.id;
    return { post, pages, slug };
  }

  /**
   * Build a multi-page PDF for a single post. Pages are sized 1:1 to the
   * source image so no resampling occurs (PNG/JPG embedded as-is).
   */
  async buildPostPdf(userId: string, postId: string): Promise<{ data: Buffer; filename: string }> {
    // Lazy require so the heavyish PDF lib isn't pulled into cold-start.
    const { PDFDocument } = await import('pdf-lib');
    const { pages, slug } = await this.loadPostPages(userId, postId);

    const pdf = await PDFDocument.create();
    pdf.setTitle(`Shipublic — ${slug}`);
    pdf.setProducer('Shipublic');
    pdf.setCreator('Shipublic');
    for (const p of pages) {
      let embedded;
      let png = p.bytes;
      // pdf-lib only accepts PNG and JPG natively. Convert WebP via sharp.
      if (p.mime === 'image/webp') {
        png = await sharp(p.bytes).png().toBuffer();
      }
      if (p.mime === 'image/jpeg') {
        embedded = await pdf.embedJpg(png);
      } else {
        embedded = await pdf.embedPng(png);
      }
      const page = pdf.addPage([embedded.width, embedded.height]);
      page.drawImage(embedded, {
        x: 0,
        y: 0,
        width: embedded.width,
        height: embedded.height,
      });
    }
    const bytes = await pdf.save();
    return { data: Buffer.from(bytes), filename: `shipublic-${slug}.pdf` };
  }

  /**
   * Build a ZIP archive of all images for one post. Files are flat within the
   * archive (the post is already the implicit grouping).
   */
  async buildPostZip(userId: string, postId: string): Promise<{ data: Buffer; filename: string }> {
    const JSZipMod: any = await import('jszip');
    const JSZip = JSZipMod.default || JSZipMod;
    const { pages, slug } = await this.loadPostPages(userId, postId);
    const zip = new JSZip();
    for (const p of pages) {
      zip.file(p.filename, p.bytes);
    }
    const data = (await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })) as Buffer;
    return { data, filename: `shipublic-${slug}.zip` };
  }

  /**
   * Build a ZIP archive grouped by post. Each post becomes a top-level folder
   * containing its ordered pages. Posts with no ready images are skipped.
   */
  async buildBundleZip(
    userId: string,
    postIds?: string[] | null,
  ): Promise<{ data: Buffer; filename: string }> {
    const JSZipMod: any = await import('jszip');
    const JSZip = JSZipMod.default || JSZipMod;
    const where: any = { userId };
    if (postIds && postIds.length) where.id = { in: postIds };
    const posts = await this.prisma.post.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    const zip = new JSZip();
    let added = 0;
    for (const post of posts) {
      try {
        const { pages, slug } = await this.loadPostPages(userId, post.id);
        const folder = zip.folder(`${slug}-${post.id.slice(-6)}`);
        if (!folder) continue;
        for (const p of pages) {
          folder.file(p.filename, p.bytes);
        }
        added++;
      } catch {
        /* post has no images — skip silently */
      }
    }
    if (!added) throw new NotFoundException('no images to bundle');
    const data = (await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })) as Buffer;
    return { data, filename: `shipublic-bundle-${new Date().toISOString().slice(0, 10)}.zip` };
  }
}
