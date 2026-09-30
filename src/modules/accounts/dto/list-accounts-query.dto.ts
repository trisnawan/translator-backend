import { IsEnum, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { AccountRole, RecordStatus } from '../../../common/enums';

export class ListAccountsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(RecordStatus, { message: 'status must be either active or inactive' })
  status?: RecordStatus;

  @IsOptional()
  @IsEnum(AccountRole, { message: 'role must be either admin or client' })
  role?: AccountRole;
}
