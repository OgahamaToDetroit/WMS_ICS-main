// กติกาช่องสัญญาณ SSE — แยกเป็น pure function เพื่อเทสต์ด้วย node --test ได้
// โดยไม่ต้องต่อ database/เปิด server (แนวเดียวกับ utils/*Rules.js เส้นอื่น)
//
// wire format ของ SSE เป็นข้อความบรรทัดล้วน: "event: <ชื่อ>\ndata: <ข้อความ>\n\n"
// ผิดแม้แต่ \n\n ปิดท้าย browser จะรอเงียบๆ ไม่ยิง event และไม่มี error ให้เห็น — จึงพินด้วยเทสต์

// ชุด event ที่ระบบรู้จัก — หน้าเว็บ (เฟส 3) จะ addEventListener ตามชื่อพวกนี้เป๊ะ
export const SSE_EVENTS = ['transactions', 'products', 'users'];

// คืนข้อความพร้อมเขียนลง stream · event นอกชุดคืน null ให้ผู้เรียกตัดสินใจ (เตือน/ข้าม)
// data เป็น {} เสมอ — สัญญาณบอกแค่ "มีอะไรเปลี่ยน ไป refetch เอง" ไม่พาข้อมูลจริงออกไป
export const formatEventMessage = (event) =>
  SSE_EVENTS.includes(event) ? `event: ${event}\ndata: {}\n\n` : null;
