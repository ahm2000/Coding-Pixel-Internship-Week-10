import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { Project } from '../entities/Project';
import { PositiveIntPipe } from '../common/positive-int.pipe';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthenticatedUser } from '../auth/jwt.strategy';
import { Roles } from '../rbac/roles.decorator';
import { ProjectFromRoute } from '../rbac/project-source.decorator';
import { ProjectRole } from '../entities/Enums';

const ANY_ROLE = [
  ProjectRole.OWNER,
  ProjectRole.ADMIN,
  ProjectRole.MEMBER,
  ProjectRole.VIEWER,
];

@Controller('projects')
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  // No @Roles() here: creating a project has no project yet to check a
  // role on. Any authenticated user may create one and becomes its owner.
  @Post()
  create(
    @Body() dto: CreateProjectDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Project> {
    return this.projectsService.create(dto, user.id);
  }

  @Get()
  findAll(@CurrentUser() user: AuthenticatedUser): Promise<Project[]> {
    return this.projectsService.findAllForUser(user.id);
  }

  @Roles(...ANY_ROLE)
  @ProjectFromRoute('id')
  @Get(':id')
  findOne(@Param('id', PositiveIntPipe) id: number): Promise<Project> {
    return this.projectsService.findOne(id);
  }

  @Roles(ProjectRole.OWNER, ProjectRole.ADMIN)
  @ProjectFromRoute('id')
  @Patch(':id')
  update(
    @Param('id', PositiveIntPipe) id: number,
    @Body() dto: UpdateProjectDto,
  ): Promise<Project> {
    return this.projectsService.update(id, dto);
  }

  // C2: only owner or admin may delete a project - the most destructive
  // action gets the tightest gate.
  @Roles(ProjectRole.OWNER, ProjectRole.ADMIN)
  @ProjectFromRoute('id')
  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id', PositiveIntPipe) id: number): Promise<void> {
    await this.projectsService.remove(id);
  }
}
