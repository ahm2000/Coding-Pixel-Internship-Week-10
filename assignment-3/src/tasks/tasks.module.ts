import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Task } from '../entities/Task';
import { Tag } from '../entities/Tag';
import { Project } from '../entities/Project';
import { User } from '../entities/User';
import { ProjectMember } from '../entities/ProjectMember';
import { TasksService } from './tasks.service';
import { TasksController } from './tasks.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Task, Tag, Project, User, ProjectMember]),
  ],
  controllers: [TasksController],
  providers: [TasksService],
  exports: [TypeOrmModule],
})
export class TasksModule {}
