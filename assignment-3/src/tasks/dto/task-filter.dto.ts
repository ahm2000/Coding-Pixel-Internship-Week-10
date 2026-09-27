import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional } from 'class-validator';
import { TaskStatus } from '../../entities/Enums';
import { PaginationQueryDto } from '../../common/pagination-query.dto';

export class TaskFilterDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus;

  // Required, not optional: RolesGuard already demands it (see
  // ProjectFromQuery on TasksController.findAll) to keep an unfiltered
  // list from crossing project boundaries once RBAC is in play.
  @Type(() => Number)
  @IsInt()
  projectId!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  assigneeId?: number;
}
