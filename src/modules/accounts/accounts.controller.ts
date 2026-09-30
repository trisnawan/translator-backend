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
import { AccountsService } from './accounts.service';
import { AccountResponse } from './dto/account-response.dto';
import { CreateAccountDto } from './dto/create-account.dto';
import { ListAccountsQueryDto } from './dto/list-accounts-query.dto';
import { UpdateAccountDto } from './dto/update-account.dto';

@Controller('accounts')
@Roles(AccountRole.ADMIN)
export class AccountsController {
  constructor(private readonly accountsService: AccountsService) {}

  @Get()
  @ResponseMessage('Accounts retrieved successfully')
  findAll(
    @Query() query: ListAccountsQueryDto,
  ): Promise<PaginatedResult<AccountResponse>> {
    return this.accountsService.paginate(query);
  }

  @Get('detail/:id')
  @ResponseMessage('Account retrieved successfully')
  async findOne(@Param() params: UuidParamDto): Promise<AccountResponse> {
    return this.accountsService.toResponse(
      await this.accountsService.findById(params.id),
    );
  }

  @Post('insert')
  @ResponseMessage('Account created successfully')
  create(@Body() dto: CreateAccountDto): Promise<AccountResponse> {
    return this.accountsService.create(dto);
  }

  @Put('update/:id')
  @ResponseMessage('Account updated successfully')
  update(
    @Param() params: UuidParamDto,
    @Body() dto: UpdateAccountDto,
  ): Promise<AccountResponse> {
    return this.accountsService.update(params.id, dto);
  }

  @Delete('delete/:id')
  @ResponseMessage('Account deleted successfully')
  async remove(
    @Param() params: UuidParamDto,
    @CurrentAccount() account: AuthenticatedAccount,
  ): Promise<null> {
    await this.accountsService.remove(params.id, account.id);

    return null;
  }
}
