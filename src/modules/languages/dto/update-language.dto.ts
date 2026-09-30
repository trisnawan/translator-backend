import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { RecordStatus } from '../../../common/enums';

export class UpdateLanguageDto {
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
}
