import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';

export interface JwtPayload {
  sub: string;
  username: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async upsertGithubUser(profile: {
    githubId: string;
    username: string;
    name?: string | null;
    email?: string | null;
    avatarUrl?: string | null;
    accessToken: string;
    scopes?: string | null;
  }) {
    return this.prisma.user.upsert({
      where: { githubId: profile.githubId },
      create: {
        githubId: profile.githubId,
        username: profile.username,
        name: profile.name ?? undefined,
        email: profile.email ?? undefined,
        avatarUrl: profile.avatarUrl ?? undefined,
        accessToken: profile.accessToken,
        scopes: profile.scopes ?? undefined,
      },
      update: {
        username: profile.username,
        name: profile.name ?? undefined,
        email: profile.email ?? undefined,
        avatarUrl: profile.avatarUrl ?? undefined,
        accessToken: profile.accessToken,
        scopes: profile.scopes ?? undefined,
      },
    });
  }

  signSession(userId: string, username: string) {
    const payload: JwtPayload = { sub: userId, username };
    return this.jwt.sign(payload);
  }

  verify(token: string): JwtPayload {
    return this.jwt.verify<JwtPayload>(token);
  }

  async getUserById(id: string) {
    return this.prisma.user.findUnique({ where: { id } });
  }
}
