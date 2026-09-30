import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateAccountKeyDto {
  /**
   * Owner of the key. Required for admins, ignored for clients
   * (their own account id is always used).
   */
  @IsOptional()
  @IsString()
  @Matches(/^[0-9a-fA-F-]{36}$/, { message: 'account_id must be a valid UUID' })
  account_id?: string;

  /**
   * Shared secret used to sign the `Authorization` token of `/translate` and of
   * the callback. When omitted, the API generates one and returns it once.
   */
  @IsOptional()
  @IsString()
  @MinLength(16, { message: 'secret_key must be at least 16 characters' })
  @MaxLength(255, {
    message: 'secret_key must be less than or equal to 255 characters',
  })
  secret_key?: string;

  /** Where the translation result is sent. `null` when the client polls `/histories`. */
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'callback_url cannot be empty' })
  @IsUrl(
    { require_tld: false, protocols: ['http', 'https'] },
    { message: 'callback_url must be a valid http(s) URL' },
  )
  @MaxLength(500, {
    message: 'callback_url must be less than or equal to 500 characters',
  })
  callback_url?: string;
}
