import { SetMetadata } from '@nestjs/common';
import { ProjectRole } from '../entities/Enums';

export const ROLES_KEY = 'roles';

/** The caller must hold one of these roles on the route's resolved project. */
export const Roles = (...roles: ProjectRole[]) => SetMetadata(ROLES_KEY, roles);
