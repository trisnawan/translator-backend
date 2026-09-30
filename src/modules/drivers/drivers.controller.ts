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
import { CurrentAccount } from '../../common/decorators/current-account.decorator';
import { ResponseMessage } from '../../common/decorators/response-message.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { AccountRole } from '../../common/enums';
import { AuthenticatedAccount } from '../../common/interfaces/authenticated-account.interface';
import { AccountDriversService } from '../account-drivers/account-drivers.service';
import { CreateDriverDto } from './dto/create-driver.dto';
import { DriverIdParamDto } from './dto/driver-id-param.dto';
import { DriverResponse } from './dto/driver-response.dto';
import { ListDriversQueryDto } from './dto/list-drivers-query.dto';
import { UpdateDriverDto } from './dto/update-driver.dto';
import { DriversService } from './drivers.service';

@Controller('drivers')
export class DriversController {
  constructor(
    private readonly driversService: DriversService,
    private readonly accountDriversService: AccountDriversService,
  ) {}

  /**
   * Admins see every driver, clients only the drivers assigned to their account
   * through `account_drivers`.
   */
  @Get()
  @Roles(AccountRole.ADMIN, AccountRole.CLIENT)
  @ResponseMessage('Drivers retrieved successfully')
  async findAll(
    @Query() query: ListDriversQueryDto,
    @CurrentAccount() account: AuthenticatedAccount,
  ): Promise<PaginatedResult<DriverResponse>> {
    const allowedDriverIds =
      account.role === AccountRole.ADMIN
        ? undefined
        : await this.accountDriversService.findDriverIdsByAccount(account.id);

    return this.driversService.paginate(query, allowedDriverIds);
  }

  @Post('insert')
  @Roles(AccountRole.ADMIN)
  @ResponseMessage('Driver created successfully')
  create(@Body() dto: CreateDriverDto): Promise<DriverResponse> {
    return this.driversService.create(dto);
  }

  @Put('update/:id')
  @Roles(AccountRole.ADMIN)
  @ResponseMessage('Driver updated successfully')
  update(
    @Param() params: DriverIdParamDto,
    @Body() dto: UpdateDriverDto,
  ): Promise<DriverResponse> {
    return this.driversService.update(params.id, dto);
  }

  @Delete('delete/:id')
  @Roles(AccountRole.ADMIN)
  @ResponseMessage('Driver deleted successfully')
  async remove(@Param() params: DriverIdParamDto): Promise<null> {
    await this.driversService.remove(params.id);

    return null;
  }
}
