import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { PaginatedResult } from '../../common/dto/paginated-result.dto';
import { UuidParamDto } from '../../common/dto/uuid-param.dto';
import { CurrentAccount } from '../../common/decorators/current-account.decorator';
import { ResponseMessage } from '../../common/decorators/response-message.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { AccountRole } from '../../common/enums';
import { AuthenticatedAccount } from '../../common/interfaces/authenticated-account.interface';
import { AccountKeysService } from './account-keys.service';
import {
  AccountKeyCreatedResponse,
  AccountKeyResponse,
} from './dto/account-key-response.dto';
import { CreateAccountKeyDto } from './dto/create-account-key.dto';
import { ListAccountKeysQueryDto } from './dto/list-account-keys-query.dto';
import { UpdateAccountKeyDto } from './dto/update-account-key.dto';

/**
 * Both roles manage their own keys, an admin may additionally target any
 * account through `account_id`.
 */
@Controller('account-keys')
@Roles(AccountRole.ADMIN, AccountRole.CLIENT)
export class AccountKeysController {
  constructor(private readonly accountKeysService: AccountKeysService) {}

  @Get()
  @ResponseMessage('Account keys retrieved successfully')
  findAll(
    @Query() query: ListAccountKeysQueryDto,
    @CurrentAccount() account: AuthenticatedAccount,
  ): Promise<PaginatedResult<AccountKeyResponse>> {
    return this.accountKeysService.paginate(query, account);
  }

  @Get('detail/:id')
  @ResponseMessage('Account key retrieved successfully')
  findOne(
    @Param() params: UuidParamDto,
    @CurrentAccount() account: AuthenticatedAccount,
  ): Promise<AccountKeyResponse> {
    return this.accountKeysService.findDetail(params.id, account);
  }

  @Post('insert')
  @ResponseMessage('Account key created successfully')
  create(
    @Body() dto: CreateAccountKeyDto,
    @CurrentAccount() account: AuthenticatedAccount,
  ): Promise<AccountKeyCreatedResponse> {
    return this.accountKeysService.create(dto, account);
  }

  @Put('update/:id')
  @ResponseMessage('Account key updated successfully')
  update(
    @Param() params: UuidParamDto,
    @Body() dto: UpdateAccountKeyDto,
    @CurrentAccount() account: AuthenticatedAccount,
  ): Promise<AccountKeyResponse> {
    return this.accountKeysService.update(params.id, dto, account);
  }

  @Delete('delete/:id')
  @ResponseMessage('Account key deleted successfully')
  async remove(
    @Param() params: UuidParamDto,
    @CurrentAccount() account: AuthenticatedAccount,
  ): Promise<null> {
    await this.accountKeysService.remove(params.id, account);

    return null;
  }
}
