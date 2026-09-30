import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { compare, hash } from 'bcryptjs';

/** Password hashing helper (bcrypt). */
@Injectable()
export class PasswordService {
  private readonly rounds: number;

  constructor(private readonly configService: ConfigService) {
    this.rounds = this.configService.getOrThrow<number>(
      'security.bcryptRounds',
    );
  }

  hash(plainPassword: string): Promise<string> {
    return hash(plainPassword, this.rounds);
  }

  compare(plainPassword: string, hashedPassword: string): Promise<boolean> {
    return compare(plainPassword, hashedPassword);
  }
}
