import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { DRIVER_ID_PATTERN } from './create-driver.dto';

/** Route parameter of `/drivers/update/{ID}` and `/drivers/delete/{ID}`. */
export class DriverIdParamDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  @Matches(DRIVER_ID_PATTERN, {
    message:
      'id may only contain lowercase letters, numbers, dot, dash and underscore (3-20 characters)',
  })
  @Transform(({ value }) => String(value).trim().toLowerCase())
  id!: string;
}
