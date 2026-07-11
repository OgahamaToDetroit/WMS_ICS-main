import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { setupIntegrationTest } from './setup.js';

let context;
let api;

before(async () => {
  context = await setupIntegrationTest();
  api = request(context.app);
});

after(async () => {
  await context?.cleanup();
});

test('API auth 1: login ถูกได้ token และ login ผิดได้ 401', async () => {
  const success = await api.post('/api/login').send({
    username: context.fixtures.users.admin.username,
    password: context.fixtures.password
  });
  assert.equal(success.status, 200);
  assert.equal(success.body.success, true);
  assert.equal(typeof success.body.token, 'string');
  assert.ok(success.body.token.length > 0);

  const rejected = await api.post('/api/login').send({
    username: context.fixtures.users.admin.username,
    password: 'wrong-password'
  });
  assert.equal(rejected.status, 401);
  assert.equal(rejected.body.success, false);
});

test('API auth 2: endpoint ที่ต้อง auth ปฏิเสธคำขอที่ไม่มี token', async () => {
  const response = await api.get('/api/products');
  assert.equal(response.status, 401);
  assert.equal(response.body.success, false);
});

test('API auth 3: register บังคับ role เริ่มต้นเป็น Viewer เสมอ', async () => {
  const response = await api.post('/api/register').send({
    username: 'integration_registered',
    email: 'integration_registered@example.test',
    password: context.fixtures.password
  });
  assert.equal(response.status, 200);
  assert.equal(response.body.success, true);

  const created = await context.prisma.user.findUnique({
    where: { username: 'integration_registered' }
  });
  assert.equal(created.role, 'Viewer');
  assert.equal(created.status, 'Pending');
  assert.equal(created.is_active, true);
});

test('API auth 4: login ซ้ำทำให้ token เก่าโดน SESSION_REPLACED', async () => {
  const credentials = {
    username: context.fixtures.users.operator.username,
    password: context.fixtures.password
  };
  const first = await api.post('/api/login').send(credentials);
  const second = await api.post('/api/login').send(credentials);
  assert.equal(first.status, 200);
  assert.equal(second.status, 200);

  const oldSession = await api
    .get('/api/products')
    .set('Authorization', `Bearer ${first.body.token}`);
  assert.equal(oldSession.status, 401);
  assert.equal(oldSession.body.code, 'SESSION_REPLACED');

  const currentSession = await api
    .get('/api/products')
    .set('Authorization', `Bearer ${second.body.token}`);
  assert.equal(currentSession.status, 200);
});
