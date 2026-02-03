import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { BearerTokenAuthGuard } from './auth.guard';

@Module({
  providers: [
    {
      provide: APP_GUARD,
      useClass: BearerTokenAuthGuard,
    },
  ],
})
export class AuthModule {}
