import 'reflect-metadata';
import * as dotenv from 'dotenv';
import { DataSource } from 'typeorm';
import { User } from './entities/User';
import { Project } from './entities/Project';
import { ProjectMember } from './entities/ProjectMember';
import { Task } from './entities/Task';
import { Tag } from './entities/Tag';
import { Comment } from './entities/Comment';
import { RefreshToken } from './entities/RefreshToken';

// The typeorm CLI runs this file directly (not through Nest's ConfigModule),
// so it needs its own env file choice: `NODE_ENV=test` (set by the
// `migration:run:test` script) points it at `.env.test` instead of `.env`.
dotenv.config({ path: process.env.NODE_ENV === 'test' ? '.env.test' : '.env' });

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  synchronize: false,
  entities: [User, Project, ProjectMember, Task, Tag, Comment, RefreshToken],
  migrations: ['src/migrations/*.ts'],
});
