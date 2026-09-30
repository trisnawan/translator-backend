import { IsEnum, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { DriverType, RecordStatus } from '../../../common/enums';

export class ListDriversQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(RecordStatus, { message: 'status must be either active or inactive' })
  status?: RecordStatus;

  @IsOptional()
  @IsEnum(DriverType, { message: 'type must be either ai or api' })
  type?: DriverType;
}
