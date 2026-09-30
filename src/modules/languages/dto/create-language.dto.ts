import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';
import { RecordStatus } from '../../../common/enums';

export class CreateLanguageDto {
  /** ISO 639-1 code, stored in lowercase (`en`, `id`, ...). */
  @IsString()
  @IsNotEmpty({ message: 'id is required' })
  @Length(2, 2, { message: 'id must be exactly 2 characters' })
  @Matches(/^[a-zA-Z]{2}$/, { message: 'id must contain letters only' })
  @Transform(({ value }) => String(value).toLowerCase())
  id!: string;

  @IsString()
  @IsNotEmpty({ message: 'name is required' })
  @MaxLength(100, {
    message: 'name must be less than or equal to 100 characters',
  })
  name!: string;

  @IsOptional()
  @IsEnum(RecordStatus, { message: 'status must be either active or inactive' })
  status?: RecordStatus;
}
