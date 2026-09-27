import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/bootstrap';

export interface TestApp {
  app: INestApplication;
  dataSource: DataSource;
}

// The one place an e2e spec builds an app - reuses configureApp() so the
// suite exercises exactly the pipes/filters/interceptors main.ts applies,
// never a hand-rolled subset that could quietly drift from production.
export async function createTestApp(): Promise<TestApp> {
  const moduleRef: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleRef.createNestApplication();
  configureApp(app);
  await app.init();

  return { app, dataSource: app.get(DataSource) };
}
