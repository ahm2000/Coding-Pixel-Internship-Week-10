import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  OneToMany,
} from 'typeorm';
import { Exclude } from 'class-transformer';
import { Project } from './Project';
import { ProjectMember } from './ProjectMember';
import { Task } from './Task';
import { Comment } from './Comment';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  name!: string;

  @Column({ unique: true })
  email!: string;

  // Excluded from every response by the global ClassSerializerInterceptor
  // (main.ts) - this is the only place that decides passwordHash never
  // leaves the process, so it can't be forgotten on a route that embeds
  // a User indirectly (project.owner, task.assignee, comment.author).
  @Exclude()
  @Column({ name: 'password_hash' })
  passwordHash!: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @OneToMany(() => Project, (project) => project.owner)
  ownedProjects!: Project[];

  @OneToMany(() => ProjectMember, (member) => member.user)
  memberships!: ProjectMember[];

  @OneToMany(() => Task, (task) => task.assignee)
  assignedTasks!: Task[];

  @OneToMany(() => Comment, (comment) => comment.author)
  comments!: Comment[];
}
