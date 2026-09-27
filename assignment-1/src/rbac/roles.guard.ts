import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProjectMember } from '../entities/ProjectMember';
import { Task } from '../entities/Task';
import { ProjectRole } from '../entities/Enums';
import { AuthenticatedUser } from '../auth/jwt.strategy';
import { ROLES_KEY } from './roles.decorator';
import { PROJECT_SOURCE_KEY, ProjectSource } from './project-source.decorator';

interface RequestWithUser {
  user?: AuthenticatedUser;
  params: Record<string, string>;
  query: Record<string, string>;
  body: Record<string, unknown>;
  resolvedTask?: Task;
  projectMembership?: ProjectMember;
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @InjectRepository(ProjectMember)
    private readonly membersRepository: Repository<ProjectMember>,
    @InjectRepository(Task) private readonly tasksRepository: Repository<Task>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<ProjectRole[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    // Deliberately no defensive "if (!user) throw 401" here: JwtAuthGuard
    // is the only thing that's supposed to answer "who is this," and it
    // always runs first (AppModule's APP_GUARD order). If RolesGuard ever
    // ran without it, that's exactly the C4 misconfiguration this guard
    // should NOT quietly paper over - see the README for what actually
    // happens (measured, not assumed) when the order is swapped.
    const user = request.user as AuthenticatedUser;

    const projectSource = this.reflector.getAllAndOverride<ProjectSource>(
      PROJECT_SOURCE_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!projectSource) {
      throw new Error(
        `@Roles() on ${context.getClass().name}.${String(context.getHandler().name)} has no ` +
          '@ProjectFromRoute()/@ProjectFromTask() - RolesGuard has no project to check the role on.',
      );
    }

    const projectId = await this.resolveProjectId(projectSource, request);

    const membership = await this.membersRepository.findOneBy({
      userId: user.id,
      projectId,
    });
    if (!membership) {
      // No relationship to this project at all - a 403 here would
      // confirm the project exists to someone with no standing on it.
      // 404 leaks strictly less.
      throw new NotFoundException(`Project ${projectId} not found`);
    }
    if (!requiredRoles.includes(membership.role)) {
      throw new ForbiddenException(
        `Your role (${membership.role}) on this project does not permit this action`,
      );
    }

    request.projectMembership = membership;
    return true;
  }

  // Guards run before pipes (see C3's README note), so a malformed id
  // reaches RolesGuard before ParseIntPipe/PositiveIntPipe ever would.
  // Malformed input is a 400 - the request itself is bad - never a 404,
  // which is reserved for "well-formed id, no such row."
  private parsePositiveInt(raw: unknown, label: string): number {
    const value = Number(raw);
    if (!Number.isInteger(value) || value <= 0) {
      throw new BadRequestException(`${label} must be a positive integer`);
    }
    return value;
  }

  private async resolveProjectId(
    source: ProjectSource,
    request: RequestWithUser,
  ): Promise<number> {
    if (source.kind === 'project-param') {
      return this.parsePositiveInt(request.params[source.param], source.param);
    }

    if (source.kind === 'body-field') {
      return this.parsePositiveInt(request.body?.[source.field], source.field);
    }

    if (source.kind === 'query-field') {
      if (request.query?.[source.field] === undefined) {
        throw new BadRequestException(
          `A ${source.field} query parameter is required`,
        );
      }
      return this.parsePositiveInt(request.query[source.field], source.field);
    }

    const taskId = this.parsePositiveInt(
      request.params[source.param],
      source.param,
    );
    const task = await this.tasksRepository.findOne({
      where: { id: taskId },
      relations: { project: true, assignee: true },
    });
    if (!task) {
      throw new NotFoundException(`Task ${taskId} not found`);
    }
    // Stashed so a handler that already needs the guard's lookup (e.g.
    // comment creation, which loads the task anyway) doesn't have to
    // query for it a second time.
    request.resolvedTask = task;
    return task.project.id;
  }
}
