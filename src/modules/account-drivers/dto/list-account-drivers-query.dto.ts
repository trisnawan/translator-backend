import { IsOptional, IsString, Matches } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class ListAccountDriversQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  @Matches(/^[0-9a-fA-F-]{36}$/, { message: 'account_id must be a valid UUID' })
  account_id?: string;

  @IsOptional()
  @IsString()
  driver_id?: string;
}
