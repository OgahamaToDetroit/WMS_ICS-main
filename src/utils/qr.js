// แปลงข้อความจากป้าย QR เดิมของคลัง (MMYY + item_id) โดยคงรหัสทั้งหมดเป็น string
// MMYY เป็นเพียงข้อมูลประกอบ — ผู้เรียกต้องใช้ itemId 5 หลักท้ายค้นหาสินค้าเท่านั้น
export const parseWarehouseQr = (raw) => {
  const qr = String(raw).trim();

  if (!/^\d{9}$/.test(qr)) {
    return {
      ok: false,
      error: 'รหัสไม่ถูกรูปแบบ (ต้องเป็นตัวเลข 9 หลัก)'
    };
  }

  const month = qr.slice(0, 2);
  const monthNumber = Number(month);
  if (monthNumber < 1 || monthNumber > 12) {
    return {
      ok: false,
      error: 'เดือนในรหัสไม่ถูกต้อง'
    };
  }

  const yearBe = 2500 + Number(qr.slice(2, 4));

  return {
    ok: true,
    raw: qr, // ใช้แสดงผลหรือ log เท่านั้น ห้ามใช้รหัสเต็มเป็น lookup/unique key
    itemId: qr.slice(4),
    month,
    yearBe,
    yearCe: yearBe - 543
  };
};
