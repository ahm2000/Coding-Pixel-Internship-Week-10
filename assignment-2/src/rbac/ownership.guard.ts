import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Task } from '../entities/Task';
import { ProjectMember } from '../entities/ProjectMember';
import { ProjectRole } from '../entities/Enums';
import { AuthenticatedUser } from '../auth/jwt.strategy';
import { REQUIRE_OWNERSHIP_KEY } from './require-ownership.decorator';

interface RequestWithResolvedTask {
  user?: AuthenticatedUser;
  resolvedTask?: Task;
  projectMembership?: ProjectMember;
}

// Runs after RolesGuard (see AppModule's APP_GUARD order) and reuses what
// it already loaded - a fresh lookup here would just repeat RolesGuard's
// own task-loading work for @ProjectFromTask() routes.
@Injectable()
export class OwnershipGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requireOwnership = this.reflector.getAllAndOverride<boolean>(
      REQUIRE_OWNERSHIP_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!requireOwnership) {
      return true;
    }

    const request = context
      .switchToHttp()
      .getRequest<RequestWithResolvedTask>();
    const task = request.resolvedTask;
    const membership = request.projectMembership;
    if (!task || !membership) {
      throw new Error(
        '@RequireOwnership() needs @Roles()/@ProjectFromTask() on the same handler, ' +
          'so RolesGuard has already loaded the task and the membership.',
      );
    }

    // Role beats ownership at the top: owner/admin may still edit any
    // task in their project, per this domain's own role definitions.
    if (
      membership.role === ProjectRole.OWNER ||
      membership.role === ProjectRole.ADMIN
    ) {
      return true;
    }

    // The fixed schema has no "creator" column on tasks - only
    // assignee_id - so assignment is the only ownership signal this
    // domain actually has to check.
    const user = request.user as AuthenticatedUser;
    if (task.assignee?.id !== user.id) {
      throw new ForbiddenException(
        "Only the task's assignee, or an owner/admin, may edit this task",
      );
    }
    return true;
  }
}
