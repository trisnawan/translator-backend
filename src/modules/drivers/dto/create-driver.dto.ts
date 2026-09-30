import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import { DriverType, RecordStatus } from '../../../common/enums';

/** `drivers.id` grammar: lowercase driver/model name, e.g. `gemini-3.8-flash`. */
export const DRIVER_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{2,19}$/;

export class CreateDriverDto {
  /**
   * Driver id, its prefix decides which engine executes the translation
   * (`gemini-*`, `claude-*`, `deepseek-*`, `api-google-translate`).
   */
  @IsString()
  @IsNotEmpty({ message: 'id is required' })
  @MaxLength(20, { message: 'id must be less than or equal to 20 characters' })
  @Matches(DRIVER_ID_PATTERN, {
    message:
      'id may only contain lowercase letters, numbers, dot, dash and underscore (3-20 characters)',
  })
  @Transform(({ value }) => String(value).trim().toLowerCase())
  id!: string;

  @IsEnum(DriverType, { message: 'type must be either ai or api' })
  type!: DriverType;

  @IsString()
  @IsNotEmpty({ message: 'name is required' })
  @MaxLength(100, {
    message: 'name must be less than or equal to 100 characters',
  })
  name!: string;

  @IsOptional()
  @IsEnum(RecordStatus, { message: 'status must be either active or inactive' })
  status?: RecordStatus;

  /** Provider credential, stored encrypted. Optional so a driver can be registered before its key is known. */
  @IsOptional()
  @IsString()
  @MaxLength(10000, { message: 'secret_key is too long' })
  secret_key?: string;

  @IsOptional()
  @IsInt({ message: 'max_rpm must be an integer' })
  @Min(0, { message: 'max_rpm must be greater than or equal to 0' })
  max_rpm?: number;

  @IsOptional()
  @IsInt({ message: 'max_rpd must be an integer' })
  @Min(0, { message: 'max_rpd must be greater than or equal to 0' })
  max_rpd?: number;
}
