import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/** Query parameters shared by every `GET` list endpoint. */
export class PaginationQueryDto {
  /** Page number, starting from 1. */
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'page must be an integer' })
  @Min(1, { message: 'page must be greater than or equal to 1' })
  page: number = 1;

  /** Number of rows per page (1 - 100). */
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'limit must be an integer' })
  @Min(1, { message: 'limit must be greater than or equal to 1' })
  @Max(100, { message: 'limit must be less than or equal to 100' })
  limit: number = 10;

  /** Free text keyword, matched against the searchable columns of the resource. */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  /** Sort direction applied to the creation date. */
  @IsOptional()
  @IsIn(['asc', 'desc'], { message: 'order must be either asc or desc' })
  order: 'asc' | 'desc' = 'desc';

  get skip(): number {
    return (this.page - 1) * this.limit;
  }
}
