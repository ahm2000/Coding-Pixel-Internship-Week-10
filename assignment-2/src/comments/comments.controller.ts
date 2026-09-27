import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { CommentsService } from './comments.service';
import { CreateCommentDto } from './dto/create-comment.dto';
import { Comment } from '../entities/Comment';
import { Paginated } from '../common/pagination';
import { PaginationQueryDto } from '../common/pagination-query.dto';
import { PositiveIntPipe } from '../common/positive-int.pipe';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthenticatedUser } from '../auth/jwt.strategy';
import { Roles } from '../rbac/roles.decorator';
import { ProjectFromTask } from '../rbac/project-source.decorator';
import { ProjectRole } from '../entities/Enums';

const ANY_ROLE = [
  ProjectRole.OWNER,
  ProjectRole.ADMIN,
  ProjectRole.MEMBER,
  ProjectRole.VIEWER,
];
const CAN_WRITE = [ProjectRole.OWNER, ProjectRole.ADMIN, ProjectRole.MEMBER];

@Controller('tasks/:taskId/comments')
export class CommentsController {
  constructor(private readonly commentsService: CommentsService) {}

  @Roles(...CAN_WRITE)
  @ProjectFromTask('taskId')
  @Post()
  create(
    @Param('taskId', PositiveIntPipe) taskId: number,
    @Body() dto: CreateCommentDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Comment> {
    return this.commentsService.addComment(taskId, dto, user.id);
  }

  @Roles(...ANY_ROLE)
  @ProjectFromTask('taskId')
  @Get()
  findAll(
    @Param('taskId', PositiveIntPipe) taskId: number,
    @Query() pagination: PaginationQueryDto,
  ): Promise<Paginated<Comment>> {
    return this.commentsService.findByTask(taskId, pagination);
  }
}
