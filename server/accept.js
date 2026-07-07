// ตรวจรับ database เทียบตัวเลข ณ วันส่งมอบ (DATABASE.md ข้อ 5)
// ใช้กับไฟล์ที่เพิ่ง copy จากต้นฉบับ/ซ้อมขึ้นจริง — ฐานที่มีข้อมูลใช้งานแล้วตัวเลขจะโตขึ้นเป็นธรรมดา
// วิธีใช้: node accept.js [path]   (ค่าเริ่มต้น ./warehouse.dev.db)
import Database from 'better-sqlite3';

const dbPath = process.argv[2] || './warehouse.dev.db';
const db = new Database(dbPath, { readonly: true, fileMustExist: true });
const one = (sql) => Object.values(db.prepare(sql).get())[0];

const checks = [
  ['item_groups', () => one('SELECT COUNT(*) FROM item_groups'), 23],
  ['items', () => one('SELECT COUNT(*) FROM items'), 2382],
  ['stock_transactions', () => one('SELECT COUNT(*) FROM stock_transactions'), 579],
  ['users (ว่าง ณ ส่งมอบ)', () => one('SELECT COUNT(*) FROM users'), 0],
  ['stock_documents (ว่าง)', () => one('SELECT COUNT(*) FROM stock_documents'), 0],
  ['stock_request_items (ว่าง)', () => one('SELECT COUNT(*) FROM stock_request_items'), 0],
  ['สินค้ายอดติดลบ', () => one(`SELECT COUNT(*) FROM (
      SELECT item_id FROM stock_transactions GROUP BY item_id HAVING SUM(qty_change) < 0)`), 64],
  ['ยอดรวมทั้งคลัง', () => Math.round(one('SELECT SUM(qty_change) FROM stock_transactions') * 100) / 100, 3016.85],
];

let failed = 0;
console.log(`ตรวจรับ: ${dbPath}\n`);
for (const [name, fn, expected] of checks) {
  const actual = fn();
  const ok = actual === expected;
  if (!ok) failed++;
  console.log(`${ok ? '[ผ่าน]' : '[ไม่ผ่าน]'} ${name} = ${actual}${ok ? '' : ` (ต้องได้ ${expected})`}`);
}
db.close();

console.log(failed === 0 ? '\nผ่านทั้งหมด — database ตรงกับสภาพวันส่งมอบ' : `\nไม่ผ่าน ${failed} ข้อ`);
process.exit(failed === 0 ? 0 : 1);
