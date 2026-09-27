import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Project } from '../entities/Project';
import { User } from '../entities/User';
import { ProjectMember } from '../entities/ProjectMember';
import { ProjectRole } from '../entities/Enums';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';

@Injectable()
export class ProjectsService {
  constructor(
    @InjectRepository(Project)
    private readonly projectsRepository: Repository<Project>,
    @InjectRepository(User) private readonly usersRepository: Repository<User>,
    @InjectRepository(ProjectMember)
    private readonly membersRepository: Repository<ProjectMember>,
  ) {}

  // The creator becomes owner - not a claim the client can make, derived
  // from the verified token (W2) - and that membership row is what makes
  // every later role check on this project possible at all.
  async create(dto: CreateProjectDto, currentUserId: number): Promise<Project> {
    const owner = await this.usersRepository.findOneBy({ id: currentUserId });
    if (!owner) {
      throw new NotFoundException(`User ${currentUserId} not found`);
    }

    return this.projectsRepository.manager.transaction(async (manager) => {
      const project = await manager.save(
        manager.create(Project, { name: dto.name, owner }),
      );
      await manager.save(
        manager.create(ProjectMember, {
          userId: owner.id,
          projectId: project.id,
          role: ProjectRole.OWNER,
        }),
      );
      return project;
    });
  }

  findAllForUser(currentUserId: number): Promise<Project[]> {
    return this.projectsRepository
      .createQueryBuilder('project')
      .innerJoin(
        ProjectMember,
        'membership',
        'membership.projectId = project.id',
      )
      .where('membership.userId = :userId', { userId: currentUserId })
      .orderBy('project.id', 'ASC')
      .getMany();
  }

  async findOne(id: number): Promise<Project> {
    const project = await this.projectsRepository.findOne({
      where: { id },
      relations: { owner: true },
    });
    if (!project) {
      throw new NotFoundException(`Project ${id} not found`);
    }
    return project;
  }

  async update(id: number, dto: UpdateProjectDto): Promise<Project> {
    const project = await this.findOne(id);
    if (dto.name !== undefined) {
      project.name = dto.name;
    }
    return this.projectsRepository.save(project);
  }

  async remove(id: number): Promise<void> {
    const result = await this.projectsRepository.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException(`Project ${id} not found`);
    }
  }
}
