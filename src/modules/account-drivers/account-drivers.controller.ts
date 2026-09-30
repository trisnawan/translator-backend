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
import { ResponseMessage } from '../../common/decorators/response-message.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { AccountRole } from '../../common/enums';
import { AccountDriversService } from './account-drivers.service';
import { AccountDriverResponse } from './dto/account-driver-response.dto';
import { CreateAccountDriverDto } from './dto/create-account-driver.dto';
import { ListAccountDriversQueryDto } from './dto/list-account-drivers-query.dto';
import { UpdateAccountDriverDto } from './dto/update-account-driver.dto';

@Controller('account-drivers')
@Roles(AccountRole.ADMIN)
export class AccountDriversController {
  constructor(private readonly accountDriversService: AccountDriversService) {}

  @Get()
  @ResponseMessage('Account drivers retrieved successfully')
  findAll(
    @Query() query: ListAccountDriversQueryDto,
  ): Promise<PaginatedResult<AccountDriverResponse>> {
    return this.accountDriversService.paginate(query);
  }

  @Post('insert')
  @ResponseMessage('Driver access granted successfully')
  create(@Body() dto: CreateAccountDriverDto): Promise<AccountDriverResponse> {
    return this.accountDriversService.create(dto);
  }

  @Put('update/:id')
  @ResponseMessage('Driver access updated successfully')
  update(
    @Param() params: UuidParamDto,
    @Body() dto: UpdateAccountDriverDto,
  ): Promise<AccountDriverResponse> {
    return this.accountDriversService.update(params.id, dto);
  }

  @Delete('delete/:id')
  @ResponseMessage('Driver access deleted successfully')
  async remove(@Param() params: UuidParamDto): Promise<null> {
    await this.accountDriversService.remove(params.id);

    return null;
  }
}
