import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Comment } from '../entities/Comment';
import { Task } from '../entities/Task';
import { User } from '../entities/User';
import { CreateCommentDto } from './dto/create-comment.dto';
import {
  Paginated,
  PaginationQuery,
  resolvePagination,
} from '../common/pagination';

@Injectable()
export class CommentsService {
  constructor(
    @InjectRepository(Comment)
    private readonly commentsRepository: Repository<Comment>,
    @InjectRepository(Task) private readonly tasksRepository: Repository<Task>,
    @InjectRepository(User) private readonly usersRepository: Repository<User>,
  ) {}

  private async loadTask(taskId: number): Promise<Task> {
    const task = await this.tasksRepository.findOneBy({ id: taskId });
    if (!task) {
      throw new NotFoundException(`Task ${taskId} not found`);
    }
    return task;
  }

  // authorId comes from the verified token (@CurrentUser(), passed in as
  // authorId here), never from the request body - see W2.
  async addComment(
    taskId: number,
    dto: CreateCommentDto,
    authorId: number,
  ): Promise<Comment> {
    const task = await this.loadTask(taskId);

    const author = await this.usersRepository.findOneBy({ id: authorId });
    if (!author) {
      throw new NotFoundException(`User ${authorId} not found`);
    }

    const comment = this.commentsRepository.create({
      body: dto.body,
      task,
      author,
    });
    return this.commentsRepository.save(comment);
  }

  async findByTask(
    taskId: number,
    pagination: PaginationQuery,
  ): Promise<Paginated<Comment>> {
    await this.loadTask(taskId);

    const { page, skip, take } = resolvePagination(pagination);
    const [items, total] = await this.commentsRepository.findAndCount({
      where: { task: { id: taskId } },
      order: { id: 'ASC' },
      skip,
      take,
    });

    return { items, total, page };
  }
}
