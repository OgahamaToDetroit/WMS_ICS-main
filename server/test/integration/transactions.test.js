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

const stockOf = async (itemId) => {
  const aggregate = await context.prisma.stockTransaction.aggregate({
    where: { item_id: itemId },
    _sum: { qty_change: true }
  });
  return aggregate._sum.qty_change ?? 0;
};

const createRequest = async ({ token, quantity, project }) => {
  const response = await api
    .post('/api/transactions/request')
    .set('Authorization', `Bearer ${token}`)
    .send({
      project,
      items: [{ productId: context.fixtures.items.transaction, quantity }]
    });
  assert.equal(response.status, 201);
  return context.prisma.stockDocument.findUnique({
    where: { doc_no: response.body.transactionId },
    include: { requestItems: true, transactions: true }
  });
};

test('API transactions 8: inbound ห้าม auto-create SKU และ SKU จริงทำให้ SUM เพิ่ม', async () => {
  const token = await loginAs(context.fixtures.users.admin);
  const missing = await api
    .post('/api/transactions/inbound')
    .set('Authorization', `Bearer ${token}`)
    .send({ sku: '02999', quantity: 5 });
  assert.equal(missing.status, 400);
  assert.equal(await context.prisma.item.findUnique({ where: { item_id: '02999' } }), null);

  const itemId = context.fixtures.items.transaction;
  const beforeStock = await stockOf(itemId);
  const accepted = await api
    .post('/api/transactions/inbound')
    .set('Authorization', `Bearer ${token}`)
    .send({ sku: itemId, quantity: 5, note: 'integration inbound' });
  assert.equal(accepted.status, 201);
  assert.equal(await stockOf(itemId), beforeStock + 5);

  const document = await context.prisma.stockDocument.findUnique({
    where: { doc_no: accepted.body.transactionId }
  });
  assert.equal(document.doc_type, 'RECEIVE');
  assert.equal(document.status, 'CONFIRMED');
});

test('API transactions 9: ใบ PENDING ไม่เปลี่ยนยอดและไม่สร้าง stock transaction', async () => {
  const token = await loginAs(context.fixtures.users.operator);
  const itemId = context.fixtures.items.transaction;
  const beforeStock = await stockOf(itemId);
  const beforeLedgerCount = await context.prisma.stockTransaction.count({ where: { item_id: itemId } });

  const document = await createRequest({ token, quantity: 3, project: 'integration pending' });
  assert.equal(document.status, 'PENDING');
  assert.equal(document.requestItems.length, 1);
  assert.equal(document.requestItems[0].qty_requested, 3);
  assert.equal(document.transactions.length, 0);
  assert.equal(await stockOf(itemId), beforeStock);
  assert.equal(await context.prisma.stockTransaction.count({ where: { item_id: itemId } }), beforeLedgerCount);
});

test('API transactions 10: ยืนยันบางส่วนสร้าง OUT จาก qty_confirmed เท่านั้น', async () => {
  const operatorToken = await loginAs(context.fixtures.users.operator);
  const itemId = context.fixtures.items.transaction;
  const document = await createRequest({
    token: operatorToken,
    quantity: 6,
    project: 'integration partial approval'
  });
  const beforeStock = await stockOf(itemId);

  const adminToken = await loginAs(context.fixtures.users.admin);
  const response = await api
    .put(`/api/transactions/${document.id}/resolve`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      action: 'APPROVE',
      updatedItems: [{ productId: itemId, approvedQty: 4 }],
      adminMessage: 'อนุมัติให้บางส่วนสำหรับ integration test'
    });
  assert.equal(response.status, 200);

  const resolved = await context.prisma.stockDocument.findUnique({
    where: { id: document.id },
    include: { requestItems: true, transactions: true }
  });
  assert.equal(resolved.status, 'CONFIRMED');
  assert.equal(resolved.requestItems[0].qty_requested, 6);
  assert.equal(resolved.requestItems[0].qty_confirmed, 4);
  assert.equal(resolved.transactions.length, 1);
  assert.equal(resolved.transactions[0].type, 'OUT');
  assert.equal(resolved.transactions[0].qty_change, -4);
  assert.equal(await stockOf(itemId), beforeStock - 4);
});

test('API transactions 11: อนุมัติศูนย์ทุกบรรทัดเป็น CANCELLED และไม่มี OUT', async () => {
  const operatorToken = await loginAs(context.fixtures.users.operator);
  const itemId = context.fixtures.items.transaction;
  const document = await createRequest({
    token: operatorToken,
    quantity: 2,
    project: 'integration zero approval'
  });
  const beforeStock = await stockOf(itemId);

  const adminToken = await loginAs(context.fixtures.users.admin);
  const response = await api
    .put(`/api/transactions/${document.id}/resolve`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      action: 'APPROVE',
      updatedItems: [{ productId: itemId, approvedQty: 0 }],
      adminMessage: 'ไม่มีสินค้าพร้อมจ่าย'
    });
  assert.equal(response.status, 200);

  const resolved = await context.prisma.stockDocument.findUnique({
    where: { id: document.id },
    include: { requestItems: true, transactions: true }
  });
  assert.equal(resolved.status, 'CANCELLED');
  assert.equal(resolved.requestItems[0].qty_confirmed, 0);
  assert.equal(resolved.transactions.length, 0);
  assert.equal(await stockOf(itemId), beforeStock);
});

test('API transactions 12: กัน SKU ซ้ำเกินสต็อก และ pickup ต้องเป็น Admin', async () => {
  const operatorToken = await loginAs(context.fixtures.users.operator);
  const itemId = context.fixtures.items.transaction;
  const currentStock = await stockOf(itemId);
  const perLine = Math.floor(currentStock * 0.6);
  const beforeDocCount = await context.prisma.stockDocument.count();

  const duplicate = await api
    .post('/api/transactions/request')
    .set('Authorization', `Bearer ${operatorToken}`)
    .send({
      project: 'integration duplicate sku',
      items: [
        { productId: itemId, quantity: perLine },
        { productId: itemId, quantity: perLine }
      ]
    });
  assert.equal(duplicate.status, 400);
  assert.equal(await context.prisma.stockDocument.count(), beforeDocCount);

  const pickupDocument = await createRequest({
    token: operatorToken,
    quantity: 1,
    project: 'integration pickup'
  });
  const adminToken = await loginAs(context.fixtures.users.admin);
  const approved = await api
    .put(`/api/transactions/${pickupDocument.id}/resolve`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      action: 'APPROVE',
      updatedItems: [{ productId: itemId, approvedQty: 1 }],
      adminMessage: ''
    });
  assert.equal(approved.status, 200);

  const forbidden = await api
    .put(`/api/transactions/${pickupDocument.id}/pickup`)
    .set('Authorization', `Bearer ${operatorToken}`);
  assert.equal(forbidden.status, 403);

  const pickedUp = await api
    .put(`/api/transactions/${pickupDocument.id}/pickup`)
    .set('Authorization', `Bearer ${adminToken}`);
  assert.equal(pickedUp.status, 200);

  const stored = await context.prisma.stockDocument.findUnique({
    where: { id: pickupDocument.id }
  });
  assert.ok(stored.picked_up_at instanceof Date);
});
