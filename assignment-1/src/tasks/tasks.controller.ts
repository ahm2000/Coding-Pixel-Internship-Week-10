import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { TasksService } from './tasks.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { TaskFilterDto } from './dto/task-filter.dto';
import { Task } from '../entities/Task';
import { Paginated } from '../common/pagination';
import { PositiveIntPipe } from '../common/positive-int.pipe';
import { Roles } from '../rbac/roles.decorator';
import {
  ProjectFromBody,
  ProjectFromQuery,
  ProjectFromTask,
} from '../rbac/project-source.decorator';
import { RequireOwnership } from '../rbac/require-ownership.decorator';
import { ProjectRole } from '../entities/Enums';

const ANY_ROLE = [
  ProjectRole.OWNER,
  ProjectRole.ADMIN,
  ProjectRole.MEMBER,
  ProjectRole.VIEWER,
];
const CAN_WRITE = [ProjectRole.OWNER, ProjectRole.ADMIN, ProjectRole.MEMBER];

@Controller('tasks')
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  // Viewer excluded on purpose: viewers may read, never write.
  @Roles(...CAN_WRITE)
  @ProjectFromBody('projectId')
  @Post()
  create(@Body() dto: CreateTaskDto): Promise<Task> {
    return this.tasksService.create(dto);
  }

  // projectId is a required filter now, not optional: without RBAC an
  // unfiltered list was harmless, but a role on project A must grant
  // nothing on project B (C3) - an unscoped cross-project list would
  // quietly violate that the moment RBAC exists.
  @Roles(...ANY_ROLE)
  @ProjectFromQuery('projectId')
  @Get()
  findAll(@Query() filter: TaskFilterDto): Promise<Paginated<Task>> {
    return this.tasksService.findAll(filter);
  }

  @Roles(...ANY_ROLE)
  @ProjectFromTask('id')
  @Get(':id')
  findOne(@Param('id', PositiveIntPipe) id: number): Promise<Task> {
    return this.tasksService.findOne(id);
  }

  // X1: role alone isn't enough here - a member may edit tasks, but not
  // *anyone's* task. OwnershipGuard (after this) additionally requires
  // the caller to be the task's assignee, unless their role is owner/admin.
  @Roles(...CAN_WRITE)
  @ProjectFromTask('id')
  @RequireOwnership()
  @Patch(':id')
  update(
    @Param('id', PositiveIntPipe) id: number,
    @Body() dto: UpdateTaskDto,
  ): Promise<Task> {
    return this.tasksService.update(id, dto);
  }

  @Roles(ProjectRole.OWNER, ProjectRole.ADMIN)
  @ProjectFromTask('id')
  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id', PositiveIntPipe) id: number): Promise<void> {
    await this.tasksService.remove(id);
  }
}
