import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { User } from './entities/User';
import { Project } from './entities/Project';
import { ProjectMember } from './entities/ProjectMember';
import { Task } from './entities/Task';
import { Tag } from './entities/Tag';
import { Comment } from './entities/Comment';
import { RefreshToken } from './entities/RefreshToken';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { RolesGuard } from './rbac/roles.guard';
import { OwnershipGuard } from './rbac/ownership.guard';
import { ProjectsModule } from './projects/projects.module';
import { TasksModule } from './tasks/tasks.module';
import { CommentsModule } from './comments/comments.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get<string>('DB_HOST'),
        port: config.get<number>('DB_PORT'),
        username: config.get<string>('DB_USERNAME'),
        password: config.get<string>('DB_PASSWORD'),
        database: config.get<string>('DB_NAME'),
        synchronize: false,
        entities: [
          User,
          Project,
          ProjectMember,
          Task,
          Tag,
          Comment,
          RefreshToken,
        ],
      }),
    }),
    // A generous default for the whole API (this is not the control W1
    // asks for - it just stops any single route from being unbounded).
    // The auth routes override this per-handler with @Throttle() - see
    // AuthController - to a much tighter limit.
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 100 }]),
    // RolesGuard needs these two repositories directly in this module's
    // scope: it's constructed here (via APP_GUARD useClass below), not
    // inside ProjectsModule/TasksModule, so it can't borrow theirs.
    TypeOrmModule.forFeature([ProjectMember, Task]),
    AuthModule,
    ProjectsModule,
    TasksModule,
    CommentsModule,
  ],
  providers: [
    // Order: throttle first (reject abusive traffic before doing any
    // real work), then identify (401), then authorize (403/404). C4's
    // requirement is only Jwt-before-Roles; putting Throttler ahead of
    // both is a deliberate cost-ordering choice, not a correctness one.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: OwnershipGuard },
  ],
})
export class AppModule {}
