import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { timingSafeEqual } from 'crypto';
import config from '../config.js';

export type PlayerId = 'hansu' | 'clawd';

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

@Injectable()
export class BearerTokenAuthGuard implements CanActivate {
  constructor(
    @Inject(config.KEY)
    private readonly appConfig: ConfigType<typeof config>,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const auth = (req.headers['authorization'] || req.headers['Authorization']) as
      | string
      | undefined;

    let token: string | undefined;
    if (auth && typeof auth === 'string') {
      const m = auth.match(/^Bearer\s+(.+)$/i);
      if (!m) throw new UnauthorizedException('Invalid Authorization header');
      token = m[1].trim();
    } else if (typeof req.query?.token === 'string') {
      token = req.query.token;
    }

    if (!token) {
      throw new UnauthorizedException('Missing token');
    }

    const hansu = this.appConfig.tokenHansu;
    const clawd = this.appConfig.tokenClawd;

    let playerId: PlayerId | null = null;
    if (hansu && safeEqual(token, hansu)) playerId = 'hansu';
    if (clawd && safeEqual(token, clawd)) playerId = 'clawd';

    if (!playerId) {
      throw new UnauthorizedException('Invalid token');
    }

    req.user = { playerId };
    return true;
  }
}
