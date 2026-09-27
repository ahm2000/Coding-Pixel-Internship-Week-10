import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { HealthService } from './health.service';

// C4's other option: /health reports unhealthy when the database is
// unreachable. `DataSource.query` is mocked to throw, so this never
// touches a real database - it proves the health check's own branching,
// not Postgres's.
describe('HealthService', () => {
  let dataSource: { query: jest.Mock };
  let service: HealthService;

  beforeEach(async () => {
    dataSource = { query: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      providers: [HealthService, { provide: DataSource, useValue: dataSource }],
    }).compile();
    service = moduleRef.get(HealthService);
  });

  it('reports ok when the database check succeeds', async () => {
    dataSource.query.mockResolvedValue([{ '?column?': 1 }]);

    const result = await service.check();

    expect(result.status).toBe('ok');
    expect(result.checks.database.status).toBe('ok');
    expect(result.checks.app.status).toBe('ok');
  });

  it('reports error, naming the database check, when the query rejects', async () => {
    dataSource.query.mockRejectedValue(new Error('connection refused'));

    const result = await service.check();

    expect(result.status).toBe('error');
    expect(result.checks.database.status).toBe('error');
    expect(result.checks.database.message).toContain('connection refused');
    // The app itself is still up - only the dependency is down (X1).
    expect(result.checks.app.status).toBe('ok');
  });

  it('reports error without hanging when the database check never resolves (X1)', async () => {
    dataSource.query.mockImplementation(() => new Promise(() => {}));

    const result = await service.check();

    expect(result.status).toBe('error');
    expect(result.checks.database.message).toMatch(/timed out/);
  }, 3000);
});
