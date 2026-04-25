import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { ValidationPipe, Logger } from '@nestjs/common';
import fastifyCookie from '@fastify/cookie';
import fastifyCors from '@fastify/cors';
import { AppModule } from './app.module';

async function bootstrap() {
  const adapter = new FastifyAdapter({
    logger: false,
    bodyLimit: 10 * 1024 * 1024,
    // Trust the X-Forwarded-* headers from the platform (Render/Fly/etc).
    trustProxy: true,
    // Disable the default request id generator -- saves a small amount of
    // per-request work; we rely on platform/edge tracing.
    disableRequestLogging: true,
  });

  const fastify = adapter.getInstance();
  // Replace the default JSON content-type parser so we can stash the raw body
  // for HMAC verification on the GitHub webhook route. Done once at startup.
  fastify.addContentTypeParser(
    'application/json',
    { parseAs: 'buffer' },
    (req: any, body: Buffer, done: any) => {
      try {
        req.rawBody = body;
        const json = body.length ? JSON.parse(body.toString('utf8')) : {};
        done(null, json);
      } catch (err) {
        done(err, undefined);
      }
    },
  );

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    adapter,
    { bufferLogs: true },
  );

  // Make Nest aware of process signals so Prisma / BullMQ shut down cleanly
  // and connections are released. Critical for zero-downtime deploys.
  app.enableShutdownHooks();

  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
      // Skips one extra reflect-metadata pass per request when the DTO has
      // no transform decorators on it.
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // ---------------------------------------------------------------------
  // Security + transport: helmet (security headers) + compression. Both are
  // optional Fastify plugins -- if not installed we degrade gracefully so
  // local dev continues to work without the deps.
  // ---------------------------------------------------------------------
  try {
    const helmet = (await import('@fastify/helmet')).default;
    await app.register(helmet as any, {
      // The API only serves JSON, so the strictest defaults are fine. Disable
      // CSP because we don't render HTML from this server.
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    });
  } catch {
    new Logger('Bootstrap').warn('@fastify/helmet not installed, skipping security headers');
  }

  try {
    const compress = (await import('@fastify/compress')).default;
    await app.register(compress as any, {
      // gzip + brotli; only compress payloads worth the CPU cost.
      encodings: ['br', 'gzip', 'deflate'],
      threshold: 1024,
    });
  } catch {
    new Logger('Bootstrap').warn('@fastify/compress not installed, skipping response compression');
  }

  await app.register(fastifyCookie as any, {
    secret: process.env.JWT_SECRET || 'dev-cookie-secret',
  });

  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
  await app.register(fastifyCors as any, {
    origin: [frontendUrl],
    credentials: true,
    // Cache the preflight result on the browser so subsequent same-origin
    // sub-requests skip the OPTIONS round-trip.
    maxAge: 86400,
  });

  // Add per-response Cache-Control hint for authenticated GETs so browsers
  // and any private CDN cache treat them correctly. Mutations stay no-store.
  fastify.addHook('onSend', async (req: any, reply: any, payload: any) => {
    const method = (req.method || 'GET').toUpperCase();
    if (!reply.getHeader('Cache-Control')) {
      reply.header(
        'Cache-Control',
        method === 'GET' ? 'private, max-age=0, must-revalidate' : 'no-store',
      );
    }
    return payload;
  });

  const port = Number(process.env.PORT || 4000);
  await app.listen(port, '0.0.0.0');
  new Logger('Bootstrap').log(`Shipublic API listening on :${port}`);
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Fatal bootstrap error', err);
  process.exit(1);
});
