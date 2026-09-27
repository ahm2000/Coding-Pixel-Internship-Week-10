import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/bootstrap';

export interface TestApp {
  app: INestApplication;
  dataSource: DataSource;
}

// Reuses configureApp() so the journey exercises exactly the pipes/filters/
// interceptors main.ts applies, never a hand-rolled subset.
export async function createTestApp(): Promise<TestApp> {
  const moduleRef: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleRef.createNestApplication();
  configureApp(app);
  await app.init();

  return { app, dataSource: app.get(DataSource) };
}
