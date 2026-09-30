import {
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  MinLength,
} from 'class-validator';

export class UpdateAccountKeyDto {
  /** Send a new value to replace the stored secret, omit it to keep the current one. */
  @IsOptional()
  @IsString()
  @MinLength(16, { message: 'secret_key must be at least 16 characters' })
  @MaxLength(255, {
    message: 'secret_key must be less than or equal to 255 characters',
  })
  secret_key?: string;

  /** Send `null` to remove the callback URL. */
  @IsOptional()
  @IsString()
  @IsUrl(
    { require_tld: false, protocols: ['http', 'https'] },
    { message: 'callback_url must be a valid http(s) URL' },
  )
  @MaxLength(500, {
    message: 'callback_url must be less than or equal to 500 characters',
  })
  callback_url?: string | null;
}
