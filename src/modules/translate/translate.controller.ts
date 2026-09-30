import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  CurrentAccount,
  TranslateContext,
} from '../../common/decorators/current-account.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { ResponseMessage } from '../../common/decorators/response-message.decorator';
import {
  AuthenticatedAccount,
  TranslateIdentity,
} from '../../common/interfaces/authenticated-account.interface';
import { TranslateAcceptedResponse } from './dto/translate-response.dto';
import { TranslateRequestDto } from './dto/translate-request.dto';
import { TranslateSignatureGuard } from './guards/translate-signature.guard';
import { TranslateService } from './translate.service';

@Controller('translate')
export class TranslateController {
  constructor(private readonly translateService: TranslateService) {}

  /**
   * Accepts a translation job (admin and client).
   *
   * Marked `@Public()` for the access token guard because this route uses its own
   * credential flow: `key_id` header + JWT signed with the account key secret.
   */
  @Public()
  @UseGuards(TranslateSignatureGuard)
  @Post()
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Translation request accepted')
  request(
    @Body() dto: TranslateRequestDto,
    @CurrentAccount() account: AuthenticatedAccount,
    @TranslateContext() identity: TranslateIdentity,
  ): Promise<TranslateAcceptedResponse> {
    return this.translateService.request(dto, account, identity);
  }
}
