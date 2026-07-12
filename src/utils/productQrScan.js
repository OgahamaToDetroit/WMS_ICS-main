import { parseWarehouseQr } from './qr.js';

// แปลงค่าจากอุปกรณ์สแกนเป็นคำค้น Products โดยเก็บคำค้นเดิมไว้เมื่อรหัสไม่ผ่าน
export const resolveProductQrScan = (raw, previousSearch = '') => {
  const scannedCode = String(raw).trim();
  // ปุ่มเดิมรองรับทั้ง QR และบาร์โค้ด: item_id 5 หลักจากบาร์โค้ดใช้ค้นหาได้ตรง ๆ
  if (/^\d{5}$/.test(scannedCode)) {
    return {
      ok: true,
      itemId: scannedCode,
      searchTerm: scannedCode
    };
  }

  const parsed = parseWarehouseQr(raw);
  if (!parsed.ok) {
    return {
      ok: false,
      error: parsed.error,
      searchTerm: previousSearch
    };
  }

  return {
    ok: true,
    itemId: parsed.itemId,
    searchTerm: parsed.itemId
  };
};

// ผลจาก API อาจค้นหาแบบ contains จึงต้องยืนยัน item_id ตรงตัวก่อนแจ้งว่า "พบสินค้า"
export const hasExactScannedProduct = (products, itemId) => (
  // API ของ Products ส่ง item_id ออกมาในชื่อ sku; ทั้งสองค่าต้องเป็น string 5 หลักตรงตัว
  products.some(product => product.sku === itemId)
);

// แยก guard ออกจาก React hook เพื่อพิสูจน์ได้ว่า response เก่าหรือบริบทที่เปลี่ยนแล้วจะไม่แจ้งผลย้อนหลัง
export const classifyScanResponse = (pendingScan, requestScanVersion, context) => {
  if (!pendingScan || pendingScan.version !== requestScanVersion) return 'ignore';
  if (
    context.searchTerm.trim() !== pendingScan.itemId ||
    context.groupFilter ||
    context.lowStockOnly
  ) return 'cancelled';
  return 'current';
};
