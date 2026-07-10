// กติกา Web Push ที่ database บังคับเองไม่ได้ — แยกเป็น pure function เทสต์ได้ (DATABASE.md ข้อ 6.16)

// ข้อยกเว้นกติกา soft delete (ตั้งใจ — ข้อ 6.16): push service ตอบ 410 Gone / 404 Not Found
// = อุปกรณ์เลิกรับแล้วถาวร (ผู้ใช้ถอนสิทธิ์แจ้งเตือน/ลง browser ใหม่) → ลบแถวทิ้งจริง
// เพราะนี่คือ "ที่อยู่อุปกรณ์ชั่วคราว" ไม่ใช่ข้อมูลธุรกิจ เก็บไว้มีแต่ส่งซ้ำเปลือง
// รหัสอื่น (429/5xx/เน็ตล่ม) = ปัญหาชั่วคราว ห้ามลบ — รอบหน้าอาจส่งถึง
export const isDeadSubscription = (statusCode) => statusCode === 404 || statusCode === 410;

// แปลงผลการปิดใบเบิก → ข้อความแจ้งผู้ขอ (ทรงข้อความตาม reference ให้หน้าบ้านเฟส 3 ใช้ได้เลย)
// lines: [{ qtyRequested, qtyConfirmed }] จากใบจริง — ป้ายผลคำนวณจากตัวเลขที่นี่
// ไม่รับป้ายสำเร็จรูปจากคนเรียก (ที่เดียวที่ตัดสิน = ที่เดียวที่ต้องเทสต์)
export const buildResolvePush = ({ docNo, docStatus, lines = [], note }) => {
  const approved = docStatus === 'CONFIRMED'; // CANCELLED จาก resolve = คนคลังปฏิเสธ (อนุมัติ 0 ทุกบรรทัดก็นับ)
  const allFull =
    approved && lines.length > 0 && lines.every((l) => (l.qtyConfirmed ?? 0) >= l.qtyRequested);
  const statusText = !approved ? '❌ ถูกปฏิเสธ' : allFull ? '✅ อนุมัติแล้ว' : '⚠️ อนุมัติบางส่วน';
  const pickupHint = approved ? ' — มารับสินค้าได้เลย' : ''; // อนุมัติ (ครบ/บางส่วน) = มีของรอส่งมอบจริง
  const trimmedNote = String(note || '').trim();
  return {
    title: `ผลใบเบิก ${docNo}`,
    body: `${statusText}${pickupHint}${trimmedNote ? `\nหมายเหตุ: ${trimmedNote}` : ''}`,
    url: '/homepage'
  };
};
