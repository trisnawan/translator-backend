import { Transform } from 'class-transformer';
import {
  IsNotEmpty,
  IsString,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';

/** Body of `POST /translate`. */
export class TranslateRequestDto {
  /** `drivers.id`, e.g. `gemini-3.8-flash`. */
  @IsString()
  @IsNotEmpty({ message: 'driver_id is required' })
  @MaxLength(20, {
    message: 'driver_id must be less than or equal to 20 characters',
  })
  driver_id!: string;

  /** `languages.id` of the original content. */
  @IsString()
  @Length(2, 2, { message: 'translate_from must be exactly 2 characters' })
  @Matches(/^[a-zA-Z]{2}$/, {
    message: 'translate_from must be a language code',
  })
  @Transform(({ value }) => String(value).toLowerCase())
  translate_from!: string;

  /** `languages.id` the content is translated into. */
  @IsString()
  @Length(2, 2, { message: 'translate_to must be exactly 2 characters' })
  @Matches(/^[a-zA-Z]{2}$/, { message: 'translate_to must be a language code' })
  @Transform(({ value }) => String(value).toLowerCase())
  translate_to!: string;

  /** Identifier owned by the client, echoed back on the callback. */
  @IsString()
  @IsNotEmpty({ message: 'reference_id is required' })
  @MaxLength(100, {
    message: 'reference_id must be less than or equal to 100 characters',
  })
  @Transform(({ value }) => String(value))
  reference_id!: string;

  /**
   * Content to translate. The maximum length is controlled by the
   * `TRANSLATION_MAX_CHARS` environment variable (5000 by default).
   */
  @IsString()
  @IsNotEmpty({ message: 'reference_content is required' })
  reference_content!: string;
}
