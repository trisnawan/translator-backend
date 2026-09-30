import { IsString, Matches } from 'class-validator';
import { UUID_REGEX } from '../utils/uuid.util';

/** Route parameter holding a UUIDv7 identifier (accounts, keys, histories, ...). */
export class UuidParamDto {
  @IsString()
  @Matches(UUID_REGEX, { message: 'id must be a valid UUID' })
  id!: string;
}
