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

    if (!auth || typeof auth !== 'string') {
      throw new UnauthorizedException('Missing Authorization header');
    }

    const m = auth.match(/^Bearer\s+(.+)$/i);
    if (!m) {
      throw new UnauthorizedException('Invalid Authorization header');
    }

    const token = m[1].trim();

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
