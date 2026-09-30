import { Body, Controller, Get, Post, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import { CurrentAccount } from '../../common/decorators/current-account.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { ResponseMessage } from '../../common/decorators/response-message.decorator';
import { AuthenticatedAccount } from '../../common/interfaces/authenticated-account.interface';
import { AccountResponse } from '../accounts/dto/account-response.dto';
import { AuthService } from './auth.service';
import { AccessTokenResponse } from './dto/access-token-response.dto';
import { LoginDto } from './dto/login.dto';

@Controller()
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  /** Authenticates an account and stores the token in an httpOnly cookie. */
  @Public()
  @Post('auth/login')
  @ResponseMessage('Login successful')
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AccessTokenResponse> {
    const result = await this.authService.login(dto);
    this.setAccessTokenCookie(response, result);

    return result;
  }

  /** Renews the access token of the current session. */
  @Get('access-token')
  @ResponseMessage('Access token issued successfully')
  async accessToken(
    @CurrentAccount() account: AuthenticatedAccount,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AccessTokenResponse> {
    const result = await this.authService.refresh(account);
    this.setAccessTokenCookie(response, result);

    return result;
  }

  @Get('auth/me')
  @ResponseMessage('Profile retrieved successfully')
  profile(
    @CurrentAccount() account: AuthenticatedAccount,
  ): Promise<AccountResponse> {
    return this.authService.profile(account);
  }

  @Post('auth/logout')
  @ResponseMessage('Logout successful')
  logout(@Res({ passthrough: true }) response: Response): null {
    const cookieName = this.configService.getOrThrow<string>(
      'security.jwtCookieName',
    );
    response.clearCookie(cookieName, { path: '/' });

    return null;
  }

  private setAccessTokenCookie(
    response: Response,
    result: AccessTokenResponse,
  ): void {
    const cookieName = this.configService.getOrThrow<string>(
      'security.jwtCookieName',
    );
    const isProduction =
      this.configService.getOrThrow<boolean>('app.isProduction');

    response.cookie(cookieName, result.access_token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: isProduction,
      path: '/',
      maxAge: result.expires_in * 1000,
    });
  }
}
