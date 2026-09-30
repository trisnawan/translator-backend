import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { CallbackStatus, HistoryStatus } from '../../../common/enums';

export class ListHistoriesQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(HistoryStatus, {
    message: 'status must be one of requested, translated, failed',
  })
  status?: HistoryStatus;

  @IsOptional()
  @IsEnum(CallbackStatus, {
    message: 'callback_status must be either open or close',
  })
  callback_status?: CallbackStatus;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  driver_id?: string;

  /** Admins only, clients are always scoped to their own histories. */
  @IsOptional()
  @IsString()
  @Matches(/^[0-9a-fA-F-]{36}$/, { message: 'account_id must be a valid UUID' })
  account_id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2)
  @Transform(({ value }) => String(value).toLowerCase())
  translate_from?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2)
  @Transform(({ value }) => String(value).toLowerCase())
  translate_to?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  reference_id?: string;

  /** Inclusive lower bound applied to `requested_at` (ISO 8601). */
  @IsOptional()
  @IsDateString({}, { message: 'date_from must be a valid ISO 8601 date' })
  date_from?: string;

  /** Inclusive upper bound applied to `requested_at` (ISO 8601). */
  @IsOptional()
  @IsDateString({}, { message: 'date_to must be a valid ISO 8601 date' })
  date_to?: string;
}
