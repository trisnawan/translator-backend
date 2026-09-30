import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { DriverType, RecordStatus } from '../../../common/enums';

export class UpdateDriverDto {
  @IsOptional()
  @IsEnum(DriverType, { message: 'type must be either ai or api' })
  type?: DriverType;

  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'name cannot be empty' })
  @MaxLength(100, {
    message: 'name must be less than or equal to 100 characters',
  })
  name?: string;

  @IsOptional()
  @IsEnum(RecordStatus, { message: 'status must be either active or inactive' })
  status?: RecordStatus;

  /** Send a new value to replace the stored credential, omit it to keep the current one. */
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
