import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';

export class CreateAccountDriverDto {
  @IsString()
  @IsNotEmpty({ message: 'account_id is required' })
  @Matches(/^[0-9a-fA-F-]{36}$/, { message: 'account_id must be a valid UUID' })
  account_id!: string;

  @IsString()
  @IsNotEmpty({ message: 'driver_id is required' })
  @MaxLength(20, {
    message: 'driver_id must be less than or equal to 20 characters',
  })
  @Matches(/^[a-z0-9][a-z0-9._-]{2,19}$/, { message: 'driver_id is not valid' })
  driver_id!: string;
}
