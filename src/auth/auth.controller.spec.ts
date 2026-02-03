import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../app.module';

describe('Auth (e2e-ish)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.TOKEN_HANSU = 'test-hansu';
    process.env.TOKEN_CLAWD = 'test-clawd';

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects missing auth', async () => {
    await request(app.getHttpServer()).get('/me').expect(401);
  });

  it('accepts hansu token', async () => {
    await request(app.getHttpServer())
      .get('/me')
      .set('Authorization', 'Bearer test-hansu')
      .expect(200)
      .expect({ playerId: 'hansu' });
  });
});
