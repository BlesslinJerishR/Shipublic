/**
 * Gallery HTTP API.
 *
 * - /api/gallery/ratios               public catalogue of canvas sizes
 * - /api/gallery/settings             user defaults (GET, PUT)
 * - /api/gallery/assets               upload + list backgrounds
 * - /api/gallery/assets/:id           delete
 * - /api/gallery/assets/:id/file      raw image bytes (auth required)
 * - /api/gallery/images               list + filter by postId
 * - /api/gallery/images/:id           get / patch (re-render) / delete
 * - /api/gallery/images/:id/file      raw PNG bytes
 * - /api/gallery/generate             render + persist a fresh image for a post
 */

import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { User } from '@prisma/client';
import { GalleryService, GenerateImageInput, UploadAssetInput } from './gallery.service';
import { RATIOS } from './ratios';

const ONE_HOUR = 60 * 60;

@UseGuards(JwtAuthGuard)
@Controller('gallery')
export class GalleryController {
  constructor(private readonly gallery: GalleryService) {}

  @Get('ratios')
  ratios() {
    return RATIOS;
  }

  @Get('settings')
  getSettings(@CurrentUser() user: User) {
    return this.gallery.getSettings(user.id);
  }

  @Put('settings')
  updateSettings(@CurrentUser() user: User, @Body() body: any) {
    return this.gallery.updateSettings(user.id, body || {});
  }

  // ----- Assets -----

  @Get('assets')
  listAssets(@CurrentUser() user: User) {
    return this.gallery.listAssets(user.id);
  }

  @Post('assets')
  uploadAsset(@CurrentUser() user: User, @Body() body: UploadAssetInput) {
    return this.gallery.uploadAsset(user.id, body);
  }

  @Delete('assets/:id')
  deleteAsset(@CurrentUser() user: User, @Param('id') id: string) {
    return this.gallery.deleteAsset(user.id, id);
  }

  @Get('assets/:id/file')
  async getAssetFile(@CurrentUser() user: User, @Param('id') id: string, @Res() reply: any) {
    const { data, mime } = await this.gallery.readAssetBytes(user.id, id);
    reply
      .header('Content-Type', mime)
      .header('Cache-Control', `private, max-age=${ONE_HOUR}, immutable`)
      .send(data);
  }

  // ----- Images -----

  @Get('images')
  listImages(@CurrentUser() user: User, @Query('postId') postId?: string) {
    return this.gallery.listImages(user.id, { postId });
  }

  @Get('images/:id')
  getImage(@CurrentUser() user: User, @Param('id') id: string) {
    return this.gallery.getImage(user.id, id);
  }

  @Patch('images/:id')
  updateImage(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() body: Omit<GenerateImageInput, 'postId'>,
  ) {
    return this.gallery.updateImage(user.id, id, body || {});
  }

  @Delete('images/:id')
  deleteImage(@CurrentUser() user: User, @Param('id') id: string) {
    return this.gallery.deleteImage(user.id, id);
  }

  @Get('images/:id/file')
  async getImageFile(@CurrentUser() user: User, @Param('id') id: string, @Res() reply: any) {
    const { data, mime } = await this.gallery.readImageBytes(user.id, id);
    reply
      .header('Content-Type', mime)
      .header('Cache-Control', `private, max-age=${ONE_HOUR}, must-revalidate`)
      .send(data);
  }

  @Post('generate')
  generate(@CurrentUser() user: User, @Body() body: GenerateImageInput) {
    return this.gallery.generateForPost(user.id, body);
  }

  // ----- Bundled downloads -----

  @Get('posts/:postId/download.pdf')
  async downloadPostPdf(
    @CurrentUser() user: User,
    @Param('postId') postId: string,
    @Res() reply: any,
  ) {
    const { data, filename } = await this.gallery.buildPostPdf(user.id, postId);
    reply
      .header('Content-Type', 'application/pdf')
      .header('Content-Disposition', `attachment; filename="${filename}"`)
      .header('Cache-Control', 'private, no-store')
      .send(data);
  }

  @Get('posts/:postId/download.zip')
  async downloadPostZip(
    @CurrentUser() user: User,
    @Param('postId') postId: string,
    @Res() reply: any,
  ) {
    const { data, filename } = await this.gallery.buildPostZip(user.id, postId);
    reply
      .header('Content-Type', 'application/zip')
      .header('Content-Disposition', `attachment; filename="${filename}"`)
      .header('Cache-Control', 'private, no-store')
      .send(data);
  }

  @Get('download.zip')
  async downloadBundle(
    @CurrentUser() user: User,
    @Query('postIds') postIds: string | undefined,
    @Res() reply: any,
  ) {
    const ids = (postIds || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const { data, filename } = await this.gallery.buildBundleZip(
      user.id,
      ids.length ? ids : null,
    );
    reply
      .header('Content-Type', 'application/zip')
      .header('Content-Disposition', `attachment; filename="${filename}"`)
      .header('Cache-Control', 'private, no-store')
      .send(data);
  }
}
