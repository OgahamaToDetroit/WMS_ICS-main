// กติกาเส้น products ที่ database บังคับเองไม่ได้ (SQLite ไม่มี enum/เงื่อนไขซับซ้อน) —
// แยกเป็น pure function เพื่อให้เทสต์ด้วย node --test ได้โดยไม่ต้องต่อ database
// ที่มาของแต่ละกติกา: DATABASE.md ข้อ 6 (ข้อ 8–10) + Newdatabase/docs/data_dictionary.md

// ---------------------------------------------------------------------------
// ฝั่งแสดงผล (ฐานใหม่ → JSON ทรงเดิมของหน้า React)
// ---------------------------------------------------------------------------

// ป้ายสถานะสินค้า — min_stock เป็น NULL = ยังไม่ตั้งเกณฑ์ ห้ามขึ้น Low Stock เด็ดขาด
// (การตัดสินใจข้อ 8: default กลางๆ ตัวเดียวใช้กับของทุกประเภทไม่ได้ และสร้าง alert fatigue)
export const computeStatus = (stock, minStock) => {
  if (stock <= 0) return 'Out of Stock';
  if (minStock != null && stock <= minStock) return 'Low Stock';
  return 'Active';
};

// แปลงแถว items ของฐานใหม่ (+ยอดคงเหลือที่คำนวณแล้ว) เป็นทรง JSON เดิมเป๊ะ — บทบาท "ล่าม"
// minStock/latestCost ปล่อย NULL ผ่านตามจริง (NULL = "ยังไม่ตั้ง"/"ไม่รู้" ไม่ใช่ 0 และไม่ใช่ 10)
export const mapItemToProduct = (item, stock) => ({
  id: item.item_id,
  sku: item.item_id,
  name: item.name,
  unit: item.unit || '',
  groupName: item.group?.group_name || '',
  vendor: item.vendor || '',
  latestCost: item.latest_cost ?? null,
  minStock: item.min_stock ?? null,
  stock,
  imageUrl: item.image_url || '',
  warning: stock < 0 ? 'Negative stock' : null,
  status: computeStatus(stock, item.min_stock)
});

// ผล groupBy ของ Prisma → Map(item_id → ยอดรวม) — สินค้าที่ไม่มีแถว transaction เลย
// (1,803 จาก 2,382 ตัว ณ วันส่งมอบ) จะไม่โผล่ในผล groupBy จึงต้องอ่านผ่าน stockOf ที่ถือว่าไม่มี = 0
export const buildStockMap = (groupedSums) =>
  new Map(groupedSums.map((row) => [row.item_id, row._sum?.qty_change ?? 0]));

export const stockOf = (stockMap, itemId) => stockMap.get(itemId) ?? 0;

// นับสินค้าที่ Low Stock — ใช้กติกาเดียวกับ computeStatus (ห้าม default min_stock=NULL เป็น 10)
// สำหรับ getDashboardStats: items คือ [{item_id, min_stock}], stockMap มาจาก buildStockMap
export const countLowStock = (items, stockMap) =>
  items.filter((item) => computeStatus(stockOf(stockMap, item.item_id), item.min_stock) === 'Low Stock').length;

// ---------------------------------------------------------------------------
// ช่วงเวลา "วันนี้" ตามเวลาท้องถิ่นของเครื่อง server — ใช้กรอง transaction_date
// คืน [startOfToday, startOfTomorrow) เป็น Date object (เทียบแบบ gte/lt ใน Prisma ได้ตรงๆ)
// เดิมฝั่งฐานเก่าใช้ SQLite date(x,'localtime') เทียบ string — ตัวนี้ทำสิ่งเดียวกันด้วยช่วงเวลา
// ---------------------------------------------------------------------------
export const localDayRange = (referenceDate = new Date()) => {
  const start = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate());
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
};

// ---------------------------------------------------------------------------
// ฝั่งรับค่าเข้า (JSON จากฟอร์ม → ค่าที่จะเขียนลงฐาน)
// ---------------------------------------------------------------------------

// จุดเตือนขั้นต่ำ: ว่าง/ไม่ส่ง = NULL (ยังไม่ตั้งเกณฑ์) · เลข 0 ขึ้นไป = เกณฑ์ที่ตั้งแล้ว
// เป็นทศนิยมได้ (ของบางอย่างนับเป็นเมตร) — ห้าม fallback เป็นเลขกลางๆ เงียบๆ ทุกกรณี
export const parseMinStock = (raw) => {
  if (raw == null || raw === '') return { ok: true, value: null };
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) return { ok: false, value: null };
  return { ok: true, value: parsed };
};

// ราคา: ว่าง = NULL (ไม่รู้ราคา — ห้ามแปลงเป็น 0 บาท) · ติดลบ/ไม่ใช่เลข = ปฏิเสธ
export const parseCost = (raw) => {
  if (raw == null || raw === '') return { ok: true, value: null };
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) return { ok: false, value: null };
  return { ok: true, value: parsed };
};

export const toPositiveNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

// ---------------------------------------------------------------------------
// การออกรหัสสินค้า (การตัดสินใจข้อ 9)
// ---------------------------------------------------------------------------

export const GROUP_CAPACITY = 999; // เพดานเลขวิ่งต่อกลุ่มตลอดกาล (รหัส 5 หลัก: กลุ่ม 2 + วิ่ง 3)

// เลขวิ่งถัดไป = MAX+1 ภายในกลุ่มเท่านั้น — ห้ามนับจำนวนแถว (COUNT+1) ห้ามถมช่องว่าง
// เพราะช่องว่างคือรหัสที่ถูกเผาแล้ว อาจมีป้าย QR เก่าติดของจริงอยู่ ออกซ้ำ = สแกนชี้ผิดตัว
// (หลักฐานจากข้อมูลจริง: กลุ่ม 19 มีของ 116 ตัวแต่เลขวิ่งถึง 218)
// คืน null เมื่อกลุ่มใช้รหัสครบเพดานแล้ว
export const buildNextItemId = (groupId, maxItemId) => {
  const lastSeq = maxItemId == null ? 0 : Number(String(maxItemId).slice(-3));
  const nextSeq = lastSeq + 1;
  if (nextSeq > GROUP_CAPACITY) return null;
  return `${groupId}${String(nextSeq).padStart(3, '0')}`;
};

// ---------------------------------------------------------------------------
// การออกเลขที่ใบเอกสาร (doc_no) — แอปเป็นคนออกเลข database บังคับแค่ห้ามซ้ำ
// รูปแบบตามตัวอย่างในเอกสารส่งมอบ: REC-6907-0001 = ประเภทใบ + ปี พ.ศ. 2 หลัก + เดือน + เลขวิ่ง 4 หลัก
// ---------------------------------------------------------------------------

export const buildDocNoPrefix = (docType, date) => {
  const prefix = docType === 'RECEIVE' ? 'REC' : 'ISS';
  const beYear = String(date.getFullYear() + 543).slice(-2);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${prefix}-${beYear}${month}-`;
};

// เลขวิ่งรีเซ็ตทุกเดือนตามรอบของ prefix — MAX+1 หลักการเดียวกับรหัสสินค้า
export const buildNextDocNo = (prefix, maxDocNo) => {
  const lastSeq = maxDocNo == null ? 0 : Number(String(maxDocNo).slice(prefix.length));
  return `${prefix}${String(lastSeq + 1).padStart(4, '0')}`;
};
