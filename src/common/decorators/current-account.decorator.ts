import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import {
  AuthenticatedAccount,
  TranslateIdentity,
} from '../interfaces/authenticated-account.interface';

interface RequestWithAccount {
  user?: AuthenticatedAccount;
  translate?: TranslateIdentity;
}

/**
 * Injects the authenticated account (or one of its properties) into a handler.
 * The account is resolved from the database by `JwtAuthGuard`.
 */
export const CurrentAccount = createParamDecorator(
  (
    property: keyof AuthenticatedAccount | undefined,
    context: ExecutionContext,
  ) => {
    const request = context.switchToHttp().getRequest<RequestWithAccount>();
    const account = request.user;

    return property ? account?.[property] : account;
  },
);

/**
 * Injects the identity resolved by `TranslateSignatureGuard`
 * (`key_id` header + signed JWT) into a handler.
 */
export const TranslateContext = createParamDecorator(
  (
    property: keyof TranslateIdentity | undefined,
    context: ExecutionContext,
  ) => {
    const request = context.switchToHttp().getRequest<RequestWithAccount>();
    const identity = request.translate;

    return property ? identity?.[property] : identity;
  },
);
