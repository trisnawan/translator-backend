import { IsNotEmpty, IsString, Length, Matches } from 'class-validator';
import { Transform } from 'class-transformer';

/** Route parameter of `/languages/update/{ID}`. */
export class LanguageIdParamDto {
  @IsString()
  @IsNotEmpty()
  @Length(2, 2, { message: 'id must be exactly 2 characters' })
  @Matches(/^[a-zA-Z]{2}$/, { message: 'id must contain letters only' })
  @Transform(({ value }) => String(value).toLowerCase())
  id!: string;
}
