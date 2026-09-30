import { Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { PaginatedResult } from '../../common/dto/paginated-result.dto';
import { UuidParamDto } from '../../common/dto/uuid-param.dto';
import { CurrentAccount } from '../../common/decorators/current-account.decorator';
import { ResponseMessage } from '../../common/decorators/response-message.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { AccountRole } from '../../common/enums';
import { AuthenticatedAccount } from '../../common/interfaces/authenticated-account.interface';
import { HistoryResponse } from './dto/history-response.dto';
import { ListHistoriesQueryDto } from './dto/list-histories-query.dto';
import { HistoriesService } from './histories.service';

@Controller('histories')
export class HistoriesController {
  constructor(private readonly historiesService: HistoriesService) {}

  @Get()
  @Roles(AccountRole.ADMIN, AccountRole.CLIENT)
  @ResponseMessage('Histories retrieved successfully')
  findAll(
    @Query() query: ListHistoriesQueryDto,
    @CurrentAccount() account: AuthenticatedAccount,
  ): Promise<PaginatedResult<HistoryResponse>> {
    return this.historiesService.paginate(query, account);
  }

  @Get('detail/:id')
  @Roles(AccountRole.ADMIN, AccountRole.CLIENT)
  @ResponseMessage('History retrieved successfully')
  findOne(
    @Param() params: UuidParamDto,
    @CurrentAccount() account: AuthenticatedAccount,
  ): Promise<HistoryResponse> {
    return this.historiesService.findDetail(params.id, account);
  }

  @Post('resend-callback/:id')
  @Roles(AccountRole.ADMIN, AccountRole.CLIENT)
  @ResponseMessage('Callback re-queued successfully')
  resendCallback(
    @Param() params: UuidParamDto,
    @CurrentAccount() account: AuthenticatedAccount,
  ): Promise<HistoryResponse> {
    return this.historiesService.resendCallback(params.id, account);
  }

  @Post('retranslate/:id')
  @Roles(AccountRole.ADMIN)
  @ResponseMessage('Translation re-queued successfully')
  retranslate(@Param() params: UuidParamDto): Promise<HistoryResponse> {
    return this.historiesService.retranslate(params.id);
  }

  @Delete('delete/:id')
  @Roles(AccountRole.ADMIN)
  @ResponseMessage('History deleted successfully')
  async remove(@Param() params: UuidParamDto): Promise<null> {
    await this.historiesService.remove(params.id);

    return null;
  }
}
