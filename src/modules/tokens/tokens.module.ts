import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { TokensService } from './tokens.service';

/**
 * JWT helpers shared by the access token flow and the client/translator
 * signature flow. Global so guards and workers can inject it anywhere.
 */
@Global()
@Module({
  imports: [ConfigModule, JwtModule.register({})],
  providers: [TokensService],
  exports: [TokensService],
})
export class TokensModule {}
