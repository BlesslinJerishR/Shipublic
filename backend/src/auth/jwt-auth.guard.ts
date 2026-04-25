import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { User } from '@prisma/client';
import { AuthService } from './auth.service';

export const COOKIE_NAME = process.env.COOKIE_NAME || 'shipublic_session';

// Short-lived in-memory cache of resolved users keyed by JWT. Authenticated
// requests on hot paths (e.g. dashboard fan-out fetches) used to hit the DB
// once each just to look up the same user; this reduces that to one query
// per CACHE_TTL_MS window per session.
const CACHE_TTL_MS = 30_000;
const CACHE_MAX = 1000;

interface CacheEntry { user: User; expires: number; }

const userCache = new Map<string, CacheEntry>();

function cacheGet(token: string): User | null {
  const hit = userCache.get(token);
  if (!hit) return null;
  if (hit.expires < Date.now()) {
    userCache.delete(token);
    return null;
  }
  return hit.user;
}

function cacheSet(token: string, user: User) {
  if (userCache.size >= CACHE_MAX) {
    // O(1) eviction of the oldest insertion.
    const first = userCache.keys().next().value;
    if (first) userCache.delete(first);
  }
  userCache.set(token, { user, expires: Date.now() + CACHE_TTL_MS });
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<any>();
    const cookieToken = req.cookies?.[COOKIE_NAME];
    const authHeader: string | undefined = req.headers?.authorization;
    const bearer =
      authHeader && authHeader.startsWith('Bearer ')
        ? authHeader.slice('Bearer '.length)
        : undefined;
    const token = cookieToken || bearer;
    if (!token) throw new UnauthorizedException('Missing session');

    const cached = cacheGet(token);
    if (cached) {
      req.user = cached;
      return true;
    }

    try {
      const payload = this.auth.verify(token);
      const user = await this.auth.getUserById(payload.sub);
      if (!user) throw new UnauthorizedException('User not found');
      cacheSet(token, user);
      req.user = user;
      return true;
    } catch {
      throw new UnauthorizedException('Invalid session');
    }
  }
}
