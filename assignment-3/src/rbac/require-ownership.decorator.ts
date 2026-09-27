import { SetMetadata } from '@nestjs/common';

export const REQUIRE_OWNERSHIP_KEY = 'requireOwnership';

/**
 * Beyond the role check: only the task's assignee may act, unless the
 * caller's project role is owner/admin (which overrides it). Must be
 * paired with @Roles()/@ProjectFromTask() on the same handler - this
 * reads the task OwnershipGuard's sibling RolesGuard already loaded.
 */
export const RequireOwnership = () => SetMetadata(REQUIRE_OWNERSHIP_KEY, true);
