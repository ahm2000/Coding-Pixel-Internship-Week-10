import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Comment } from '../entities/Comment';
import { Task } from '../entities/Task';
import { User } from '../entities/User';
import { ProjectMember } from '../entities/ProjectMember';
import { CommentsService } from './comments.service';
import { CommentsController } from './comments.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Comment, Task, User, ProjectMember])],
  controllers: [CommentsController],
  providers: [CommentsService],
})
export class CommentsModule {}
