import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { hash } from 'bcryptjs';
import type { Server } from 'http';
import request from 'supertest';
import { DataSource } from 'typeorm';

// The HTTP layer is what we test here: the broker does not need to be running.
process.env.RABBITMQ_ENABLED = 'false';
process.env.ENABLE_WORKER = 'false';

const TEST_EMAIL = 'e2e.spec@example.com';
const TEST_PASSWORD = 'e2e-password';

/** Envelope returned by every endpoint (see README "Format Response"). */
interface ApiEnvelope<T> {
  success: boolean;
  message: string;
  data: T;
  meta?: { total: number };
}

describe('Translator API (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  // The HTTP server is typed as `any` by Nest, supertest knows how to consume it.
  const call = () => request(app.getHttpServer() as Server);
  const envelope = <T>(body: unknown): ApiEnvelope<T> => body as ApiEnvelope<T>;

  beforeAll(async () => {
    // Imported dynamically so the environment overrides above are applied first.
    const { AppModule } = await import('../src/app.module');
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    dataSource = app.get(DataSource);
    await dataSource.query('DELETE FROM accounts WHERE email = ?', [
      TEST_EMAIL,
    ]);
    await dataSource.query(
      'INSERT INTO accounts (id, full_name, email, password, role, status, max_rpm, max_rpd, created_at, updated_at) VALUES (UNHEX(REPLACE(UUID(), "-", "")), ?, ?, ?, "client", "active", 0, 0, NOW(6), NOW(6))',
      ['E2E Spec', TEST_EMAIL, await hash(TEST_PASSWORD, 4)],
    );
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await dataSource.query('DELETE FROM accounts WHERE email = ?', [
        TEST_EMAIL,
      ]);
    }

    await app?.close();
  });

  it('GET / exposes the application information', async () => {
    const response = await call().get('/').expect(200);
    const payload = envelope<Record<string, unknown>>(response.body);

    expect(payload.success).toBe(true);
    expect(payload.data).toHaveProperty('name');
  });

  it('GET /health reports the dependency state', async () => {
    const response = await call().get('/health').expect(200);
    const payload = envelope<{
      dependencies: { database: string; broker: string };
    }>(response.body);

    expect(payload.data.dependencies.database).toBe('up');
    expect(payload.data.dependencies.broker).toBe('disabled');
  });

  it('rejects a protected endpoint without an access token', async () => {
    const response = await call().get('/languages').expect(401);
    const payload = envelope<null>(response.body);

    expect(payload.success).toBe(false);
    expect(payload.message).toContain('Access token is required');
  });

  it('rejects a login with a wrong password', async () => {
    await call()
      .post('/auth/login')
      .send({ email: TEST_EMAIL, password: 'wrong-password' })
      .expect(401);
  });

  it('logs in and calls a protected endpoint with the issued token', async () => {
    const login = await call()
      .post('/auth/login')
      .send({ email: TEST_EMAIL, password: TEST_PASSWORD });

    expect(login.status).toBe(201);
    const token = envelope<{ access_token: string }>(login.body).data
      .access_token;
    expect(token).toBeDefined();

    const languages = await call()
      .get('/languages')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const languagesPayload = envelope<unknown[]>(languages.body);

    expect(languagesPayload.success).toBe(true);
    expect(languagesPayload.meta).toHaveProperty('total');

    // A client account cannot manage master data.
    await call()
      .post('/languages/insert')
      .set('Authorization', `Bearer ${token}`)
      .send({ id: 'zz', name: 'Not allowed' })
      .expect(403);
  });

  it('requires the key_id header on POST /translate', async () => {
    const response = await call()
      .post('/translate')
      .send({ driver_id: 'gemini-3.8-flash' })
      .expect(401);
    const payload = envelope<null>(response.body);

    expect(payload.message).toContain('key_id');
  });
});
