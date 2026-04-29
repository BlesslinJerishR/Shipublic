import { Module } from '@nestjs/common';
import { ComfyUIService } from './comfyui.service';

@Module({
  providers: [ComfyUIService],
  exports: [ComfyUIService],
})
export class ComfyUIModule {}
