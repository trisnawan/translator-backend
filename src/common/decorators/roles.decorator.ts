import { SetMetadata } from '@nestjs/common';
import { AccountRole } from '../enums';

export const ROLES_KEY = 'roles';

/** Restricts a route to the given account roles. */
export const Roles = (...roles: AccountRole[]) => SetMetadata(ROLES_KEY, roles);
