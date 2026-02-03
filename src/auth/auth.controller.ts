import { Controller, Get, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

@ApiTags('auth')
@ApiBearerAuth()
@Controller()
export class AuthController {
  @Get('me')
  me(@Req() req: any) {
    return { playerId: req.user?.playerId ?? null };
  }
}
