import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CryptoService } from './crypto.service';
import { PasswordService } from './password.service';

/**
 * Cross cutting security helpers (secret encryption + password hashing).
 * Declared as global because almost every feature module needs them.
 */
@Global()
@Module({
  imports: [ConfigModule],
  providers: [CryptoService, PasswordService],
  exports: [CryptoService, PasswordService],
})
export class SecurityModule {}
