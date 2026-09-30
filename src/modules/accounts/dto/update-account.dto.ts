import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { AccountRole, RecordStatus } from '../../../common/enums';

export class UpdateAccountDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'full_name cannot be empty' })
  @MaxLength(100, {
    message: 'full_name must be less than or equal to 100 characters',
  })
  full_name?: string;

  @IsOptional()
  @IsEmail({}, { message: 'email must be a valid email address' })
  @MaxLength(150, {
    message: 'email must be less than or equal to 150 characters',
  })
  @Transform(({ value }) => String(value).trim().toLowerCase())
  email?: string;

  /** Omit to keep the current password. */
  @IsOptional()
  @IsString()
  @MinLength(6, { message: 'password must be at least 6 characters' })
  @MaxLength(100, {
    message: 'password must be less than or equal to 100 characters',
  })
  password?: string;

  @IsOptional()
  @IsEnum(AccountRole, { message: 'role must be either admin or client' })
  role?: AccountRole;

  @IsOptional()
  @IsEnum(RecordStatus, { message: 'status must be either active or inactive' })
  status?: RecordStatus;

  @IsOptional()
  @IsInt({ message: 'max_rpm must be an integer' })
  @Min(0, { message: 'max_rpm must be greater than or equal to 0' })
  max_rpm?: number;

  @IsOptional()
  @IsInt({ message: 'max_rpd must be an integer' })
  @Min(0, { message: 'max_rpd must be greater than or equal to 0' })
  max_rpd?: number;
}
