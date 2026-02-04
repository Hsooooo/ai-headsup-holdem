import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

export type PlayerId = 'hansu' | 'clawd';

@Injectable()
export class BearerTokenAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const auth = (req.headers['authorization'] || req.headers['Authorization']) as
      | string
      | undefined;

    // For browser EventSource (SSE) which can't set headers easily, allow token via query string.
    // NOTE: This is acceptable for hobby deployment but consider cookie auth or fetch-stream SSE for stricter security.
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

    const hansu = process.env.TOKEN_HANSU ?? '';
    const clawd = process.env.TOKEN_CLAWD ?? '';

    let playerId: PlayerId | null = null;
    if (token && hansu && token === hansu) playerId = 'hansu';
    if (token && clawd && token === clawd) playerId = 'clawd';

    if (!playerId) {
      throw new UnauthorizedException('Invalid token');
    }

    req.user = { playerId };
    return true;
  }
}
