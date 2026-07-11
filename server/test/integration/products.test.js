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

const loginAs = async (user) => {
  const response = await api.post('/api/login').send({
    username: user.username,
    password: context.fixtures.password
  });
  assert.equal(response.status, 200);
  return response.body.token;
};

test('API products 5: Viewer สร้างสินค้าไม่ได้แม้ส่ง payload ถูกต้อง', async () => {
  const token = await loginAs(context.fixtures.users.viewer);
  const response = await api
    .post('/api/products')
    .set('Authorization', `Bearer ${token}`)
    .send({ name: 'Viewer Must Not Create', groupId: '01', initialStock: 1 });

  assert.equal(response.status, 403);
  assert.equal(response.body.success, false);
  assert.equal(await context.prisma.item.count({ where: { name: 'Viewer Must Not Create' } }), 0);
});

test('API products 6: Admin สร้างสินค้าได้รหัส MAX+1 พร้อมใบ RECEIVE และยอดตั้งต้น', async () => {
  const token = await loginAs(context.fixtures.users.admin);
  const response = await api
    .post('/api/products')
    .set('Authorization', `Bearer ${token}`)
    .send({
      name: 'Integration Created Product',
      groupId: '01',
      unit: 'ชิ้น',
      minStock: '',
      latestCost: 12.5,
      initialStock: 7
    });

  assert.equal(response.status, 201);
  assert.equal(response.body.sku, '01004');

  const item = await context.prisma.item.findUnique({ where: { item_id: response.body.sku } });
  assert.equal(item.group_id, '01');
  assert.equal(item.min_stock, null);

  const ledger = await context.prisma.stockTransaction.findMany({
    where: { item_id: response.body.sku },
    include: { document: true }
  });
  assert.equal(ledger.length, 1);
  assert.equal(ledger[0].type, 'IN');
  assert.equal(ledger[0].qty_change, 7);
  assert.equal(ledger[0].document.doc_type, 'RECEIVE');
  assert.equal(ledger[0].document.status, 'CONFIRMED');

  const balance = await context.prisma.stockTransaction.aggregate({
    where: { item_id: response.body.sku },
    _sum: { qty_change: true }
  });
  assert.equal(balance._sum.qty_change, 7);
});

test('API products 7: lowStock=true คืนเฉพาะสินค้าที่ตั้ง min_stock และต่ำจริง', async () => {
  const token = await loginAs(context.fixtures.users.admin);
  const response = await api
    .get('/api/products?lowStock=true&limit=500')
    .set('Authorization', `Bearer ${token}`);

  assert.equal(response.status, 200);
  const ids = response.body.products.map((product) => product.sku);
  assert.ok(ids.includes(context.fixtures.items.lowStock));
  assert.ok(!ids.includes(context.fixtures.items.nullMinStock));
});
