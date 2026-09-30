import { IsEnum, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { RecordStatus } from '../../../common/enums';

export class ListLanguagesQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(RecordStatus, { message: 'status must be either active or inactive' })
  status?: RecordStatus;
}
