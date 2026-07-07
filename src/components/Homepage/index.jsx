// src/components/Homepage/index.jsx
import React, { useState, useEffect, useCallback } from 'react';
import { fetchApi, getAssetUrl } from '../../utils/api';
import toast from 'react-hot-toast';

// ฟังก์ชันดึงรูปภาพแบบเดียวกับหน้า Inventory
const getImg = (url) => {
  if (!url) return "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMDAiIGhlaWdodD0iMTAwIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZjNmNGY2Ii8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtc2l6ZT0iMTIiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGFsaWdubWVudC1iYXNlbGluZT0ibWlkZGxlIiBmb250LWZhbWlseT0ic2Fucy1zZXJpZiIgZmlsbD0iIzliOWI5YiI+Tm8gSW1hZ2U8L3RleHQ+PC9zdmc+";
  return getAssetUrl(url);
};

export default function Homepage() {
  const currentUser = JSON.parse(sessionStorage.getItem('currentUser') || '{}');
  const isAdmin = ['Admin', 'Manager'].includes(currentUser.role);
  
  const [stats, setStats] = useState({ totalItems: 0, lowStockCount: 0, inboundToday: 0, outboundToday: 0 });
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const [approveModal, setApproveModal] = useState(null);
  const [approvedQtys, setApprovedQtys] = useState({});
  const [approveMessage, setApproveMessage] = useState('');

  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [exportType, setExportType] = useState('day'); 
  
  const offset = new Date().getTimezoneOffset() * 60000;
  const todayStr = new Date(Date.now() - offset).toISOString().slice(0, 10);
  const [exportValue, setExportValue] = useState(todayStr);

  const loadDashboardData = useCallback(async () => {
    try {
      const [statsRes, txRes] = await Promise.all([
        fetchApi('/api/wms/dashboard-stats').catch(() => ({})),
        fetchApi('/api/transactions').catch(() => ({}))
      ]);
      
      if (statsRes.success) setStats(statsRes.stats || { totalItems: 0, lowStockCount: 0, inboundToday: 0, outboundToday: 0 });
      if (txRes.success) setTransactions(txRes.transactions || []);
    } catch {
      console.warn("ดึงข้อมูล Dashboard ล้มเหลว");
    } finally {
      setLoading(false);
    }
  }, []);

  // โหลดครั้งแรกแล้ว poll ซ้ำทุก 30 วินาที + refresh ตอนสลับกลับมาที่แท็บ
  // เพื่อให้คำขอเบิก/สถิติอัปเดตเองเมื่อมีคน inbound/outbound จากเครื่องอื่น
  useEffect(() => {
    loadDashboardData();
    const interval = setInterval(loadDashboardData, 30000);
    const onFocus = () => loadDashboardData();
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', onFocus);
    };
  }, [loadDashboardData]);

  const historyLogs = transactions.filter(t => t.status !== 'Pending' || t.type === 'INBOUND').sort((a,b) => new Date(b.requestDate) - new Date(a.requestDate));
  const pendingRequests = transactions.filter(t => t.status === 'Pending' && t.type === 'OUTBOUND');

  const todayLogs = historyLogs.filter(tx => {
    const txDate = tx.resolvedDate || tx.requestDate;
    if (!txDate) return false;
    const localDate = new Date(new Date(txDate).getTime() - offset).toISOString().slice(0, 10);
    return localDate === todayStr;
  });

  const exportFilteredLogs = historyLogs.filter(tx => {
    const txDate = tx.resolvedDate || tx.requestDate;
    if (!txDate) return false;
    const localDate = new Date(new Date(txDate).getTime() - offset).toISOString();
    
    if (exportType === 'day') return localDate.slice(0, 10) === exportValue;
    if (exportType === 'month') return localDate.slice(0, 7) === exportValue;
    if (exportType === 'year') return localDate.slice(0, 4) === exportValue;
    return true;
  });

  // 👇 เพิ่ม imageUrl ในฟังก์ชัน GetItems
  const getItemsToRender = (tx) => {
    if (tx.items && Array.isArray(tx.items)) return tx.items;
    return [{ productId: tx.productId, sku: tx.sku, productName: tx.productName, imageUrl: tx.imageUrl, requestedQty: tx.quantity, approvedQty: tx.quantity, status: tx.status }];
  };

  const openApproveModal = (tx) => {
    const items = getItemsToRender(tx);
    const initialQtys = {};
    items.forEach(item => { initialQtys[item.productId] = item.requestedQty; });
    setApprovedQtys(initialQtys);
    setApproveMessage('');
    setApproveModal({ ...tx, parsedItems: items });
  };

  const handleApproveSubmit = async (action) => {
    if (!approveModal) return;

    // ปฏิเสธ หรืออนุมัติไม่ครบตามจำนวนที่ขอ ต้องบอกเหตุผลให้ผู้ขอเบิกเสมอ (server ตรวจซ้ำอีกชั้น)
    const message = approveMessage.trim();
    const isPartial = approveModal.parsedItems.some(item => (approvedQtys[item.productId] || 0) < item.requestedQty);
    if (action === 'REJECT' && !message) return toast.error('กรุณาระบุเหตุผลการปฏิเสธใบเบิก');
    if (action === 'APPROVE' && isPartial && !message) return toast.error('กรุณาระบุเหตุผลเมื่ออนุมัติไม่ครบตามจำนวนที่ขอ');

    try {
      const updatedItems = approveModal.parsedItems.map(item => ({
        productId: item.productId,
        approvedQty: approvedQtys[item.productId] || 0
      }));

      const res = await fetchApi(`/api/transactions/${approveModal.id}/resolve`, {
        method: 'PUT',
        body: JSON.stringify({ action, updatedItems, adminMessage: message })
      });

      if (res.success) {
        toast.success(`อัปเดตสถานะใบเบิกสำเร็จ`);
        setApproveModal(null);
        loadDashboardData();
      }
    } catch {
      toast.error('เกิดข้อผิดพลาดในการประมวลผล');
    }
  };

  const handleExportTypeChange = (e) => {
    const type = e.target.value;
    setExportType(type);
    if (type === 'day') setExportValue(todayStr);
    if (type === 'month') setExportValue(todayStr.slice(0, 7));
    if (type === 'year') setExportValue(todayStr.slice(0, 4));
  };

  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
  ));

  // สร้างหน้ารายงานแยกแล้วเรียก print dialog — เลือกปลายทางเป็น "Save as PDF" ได้เลย
  // วิธีนี้ได้ PDF แบ่งหน้า A4 จริง ตัวอักษรคมชัด และไม่พังเพราะรูปจากเว็บภายนอกติด CORS
  const executePDFExport = () => {
    if (exportFilteredLogs.length === 0) return toast.error('ไม่มีข้อมูลในช่วงเวลาที่เลือก');

    const periodLabel = exportType === 'day' ? `วันที่ ${exportValue}` : exportType === 'month' ? `เดือน ${exportValue}` : `ปี ${exportValue}`;
    const rowsHtml = exportFilteredLogs.map((tx) => {
      const items = getItemsToRender(tx);
      const totalQty = items.reduce((sum, item) => sum + (tx.type === 'INBOUND' ? item.requestedQty : item.approvedQty), 0);
      const itemLines = items
        .map(i => `${escapeHtml(i.sku)} — ${escapeHtml(i.productName || '')} × ${tx.type === 'INBOUND' ? i.requestedQty : i.approvedQty}`)
        .join('<br/>');
      const imgSrc = items[0]?.imageUrl ? getImg(items[0].imageUrl) : '';
      return `<tr>
        <td class="nowrap">${new Date(tx.requestDate).toLocaleString('th-TH')}</td>
        <td>${escapeHtml(tx.transactionId || String(tx.id))}</td>
        <td class="center">${imgSrc ? `<img src="${escapeHtml(imgSrc)}" onerror="this.style.display='none'" />` : '-'}</td>
        <td class="${tx.type === 'INBOUND' ? 'green' : 'blue'}">${escapeHtml(tx.type)}</td>
        <td>${itemLines}</td>
        <td class="center">${totalQty}</td>
        <td>${escapeHtml(tx.requesterUsername || '-')}</td>
        <td>${escapeHtml(tx.project || '-')}</td>
        <td>${escapeHtml(tx.status)}</td>
        <td>${escapeHtml(tx.adminMessage || '-')}</td>
      </tr>`;
    }).join('');

    const printWindow = window.open('', '_blank');
    if (!printWindow) return toast.error('เบราว์เซอร์บล็อก popup กรุณาอนุญาตให้เปิดหน้าต่างใหม่');

    printWindow.document.write(`<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="utf-8" />
  <title>WMS_Report_${exportType}_${exportValue}</title>
  <style>
    body { font-family: 'Segoe UI', Tahoma, 'Leelawadee UI', sans-serif; color: #111; margin: 24px; }
    h1 { font-size: 20px; text-align: center; margin: 0 0 4px; }
    .sub { text-align: center; color: #555; margin: 2px 0 16px; font-size: 13px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th, td { border: 1px solid #999; padding: 6px 8px; text-align: left; vertical-align: top; }
    thead { background: #f0f0f0; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
    img { width: 36px; height: 36px; object-fit: cover; border-radius: 4px; }
    .center { text-align: center; }
    .nowrap { white-space: nowrap; }
    .green { color: #16a34a; font-weight: bold; }
    .blue { color: #2563eb; font-weight: bold; }
    @page { size: A4 landscape; margin: 12mm; }
  </style>
</head>
<body>
  <h1>รายงานประวัติการทำรายการคลังสินค้า (WMS)</h1>
  <p class="sub">ข้อมูลประจำ: ${escapeHtml(periodLabel)} · พิมพ์เมื่อ: ${new Date().toLocaleString('th-TH')} · ทั้งหมด ${exportFilteredLogs.length} รายการ</p>
  <table>
    <thead>
      <tr><th>วันที่-เวลา</th><th>รหัสใบรายการ</th><th>รูป</th><th>ประเภท</th><th>รายการสินค้า</th><th>จำนวนรวม</th><th>ผู้ทำรายการ</th><th>โปรเจกต์</th><th>สถานะ</th><th>หมายเหตุ</th></tr>
    </thead>
    <tbody>${rowsHtml}</tbody>
  </table>
</body>
</html>`);
    printWindow.document.close();
    printWindow.onload = () => {
      printWindow.focus();
      printWindow.print();
    };
    printWindow.onafterprint = () => printWindow.close();
    setExportModalOpen(false);
  };

  if(loading) return <div className="flex justify-center items-center h-[80vh]"><span className="loading loading-spinner text-primary loading-lg"></span></div>;

  return (
    <div className="p-4 space-y-6 bg-base-100 min-h-[86vh] animate-fade-in relative overflow-hidden">
      
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-base-content">WMS Dashboard</h1>
          <p className="text-sm text-base-content/60">ระบบจัดการคลังสินค้า และรายการคำขอเบิก/นำเข้า</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setExportModalOpen(true)} className="btn btn-sm btn-primary shadow-sm text-white">
            📄 Export PDF
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="stats shadow border border-base-200 bg-base-100"><div className="stat"><div className="stat-title text-xs font-semibold">จำนวนสินค้าทั้งหมด (ชิ้น)</div><div className="stat-value text-2xl text-primary">{stats.totalItems}</div></div></div>
        <div className="stats shadow border border-base-200 bg-base-100"><div className="stat"><div className="stat-title text-xs font-semibold">สต็อกต่ำ (Low Stock)</div><div className="stat-value text-2xl text-error">{stats.lowStockCount}</div></div></div>
        <div className="stats shadow border border-base-200 bg-base-100"><div className="stat"><div className="stat-title text-xs font-semibold">รับเข้าวันนี้ (Inbound)</div><div className="stat-value text-2xl text-success">+{stats.inboundToday}</div></div></div>
        <div className="stats shadow border border-base-200 bg-base-100"><div className="stat"><div className="stat-title text-xs font-semibold">เบิกออกวันนี้ (Outbound)</div><div className="stat-value text-2xl text-info">-{stats.outboundToday}</div></div></div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* คำขอรอดำเนินการ */}
        <div className="card bg-base-100 shadow border border-base-200 p-5">
          <h2 className="text-lg font-bold mb-4 flex items-center gap-2"><span>📋</span> คำขอเบิกรอดำเนินการ (Pending)</h2>
          <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
            <table className="table table-sm w-full">
              <thead className="sticky top-0 bg-base-100 z-10">
                <tr><th>รหัสใบเบิก</th><th>ผู้ขอ</th><th>โปรเจกต์</th><th>รายการ</th><th>จัดการ</th></tr>
              </thead>
              <tbody>
                {pendingRequests.length === 0 ? <tr><td colSpan="5" className="text-center opacity-50 py-4">ไม่มีคำขอใหม่</td></tr> : pendingRequests.map((tx) => (
                  <tr key={tx.id} className="hover:bg-base-200/40">
                    <td className="text-xs font-mono">{tx.transactionId || tx.id}</td>
                    <td className="text-xs">{tx.requesterUsername}</td>
                    <td className="text-xs max-w-[100px] truncate">{tx.project}</td>
                    <td className="text-xs">{getItemsToRender(tx).length} รายการ</td>
                    <td>
                      {isAdmin ? (
                        <button onClick={() => openApproveModal(tx)} className="btn btn-xs btn-primary shadow-sm">ตรวจสอบ</button>
                      ) : (
                        <span className="badge badge-xs badge-warning">รออนุมัติ</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* ประวัติการทำรายการ */}
        <div className="card bg-base-100 shadow border border-base-200 p-5">
          <h2 className="text-lg font-bold mb-4 flex items-center gap-2"><span>🕒</span> ประวัติการทำรายการ (วันนี้)</h2>
          <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
            <table className="table table-xs w-full">
              <thead className="sticky top-0 bg-base-100 z-10">
                <tr><th>เวลา</th><th>รูปภาพ</th><th>ประเภท</th><th>จำนวนรวม</th><th>ผู้เบิก/ผู้อนุมัติ</th><th>สถานะ</th></tr>
              </thead>
              <tbody>
                {todayLogs.length === 0 ? <tr><td colSpan="6" className="text-center opacity-50 py-4">ไม่มีประวัติรายการในวันนี้</td></tr> : todayLogs.map((tx) => {
                  const items = getItemsToRender(tx);
                  const totalQty = items.reduce((sum, item) => sum + (tx.type === 'INBOUND' ? item.requestedQty : item.approvedQty), 0);
                  
                  return (
                  <tr key={tx.id} className="hover:bg-base-200/40">
                    <td className="opacity-70 whitespace-nowrap">{new Date(tx.requestDate).toLocaleTimeString('th-TH', {timeStyle:'short'})}</td>
                    {/* 👇 เพิ่มรูปภาพในตาราง History แบบซ้อนกันกรณีมีหลายรูป 👇 */}
                    <td>
                      <div className="avatar-group -space-x-3">
                        {items.slice(0, 3).map((i, idx) => (
                          <div key={idx} className="avatar border-none"><div className="w-6 h-6 rounded-full ring-1 ring-base-300"><img src={getImg(i.imageUrl)} crossOrigin="anonymous" alt="pic"/></div></div>
                        ))}
                        {items.length > 3 && (
                          <div className="avatar placeholder border-none"><div className="w-6 h-6 rounded-full bg-neutral text-neutral-content ring-1 ring-base-300"><span className="text-[8px]">+{items.length-3}</span></div></div>
                        )}
                      </div>
                    </td>
                    <td><span className={`badge badge-xs ${tx.type === 'INBOUND' ? 'badge-success' : 'badge-info'}`}>{tx.type}</span></td>
                    <td className="font-semibold">{totalQty} ชิ้น</td>
                    <td>
                      <div className="flex flex-col">
                        <span className="font-semibold text-primary">{tx.requesterUsername}</span>
                        {tx.type === 'OUTBOUND' && <span className="text-[10px] opacity-60">โดย: {tx.adminUsername || '-'}</span>}
                      </div>
                    </td>
                    <td>
                      <span className={`badge badge-xs ${tx.status === 'Approved' ? 'badge-success' : tx.status === 'Partial' ? 'badge-warning' : 'badge-error'}`}>{tx.status}</span>
                    </td>
                  </tr>
                )})}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Modal พิจารณาใบเบิก */}
      {approveModal && isAdmin && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center backdrop-blur-md">
          <div className="bg-base-100 p-6 rounded-2xl shadow-2xl border border-base-200 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <h3 className="font-bold text-lg border-b border-base-200 pb-3 mb-4">พิจารณาใบเบิก: {approveModal.transactionId || approveModal.id}</h3>
            <p className="text-sm mb-1"><strong>ผู้ขอเบิก:</strong> {approveModal.requesterUsername}</p>
            <p className="text-sm mb-4"><strong>โปรเจกต์:</strong> {approveModal.project}</p>

            <table className="table table-sm w-full mb-4">
              <thead>
                <tr className="bg-base-200">
                  <th className="w-12">รูปภาพ</th>
                  <th>SKU / ชื่อสินค้า</th>
                  <th className="text-right">จำนวนขอเบิก</th>
                  <th className="text-center w-32">จำนวนอนุมัติ</th>
                </tr>
              </thead>
              <tbody>
                {approveModal.parsedItems.map(item => (
                  <tr key={item.productId}>
                    {/* 👇 โชว์รูปภาพในหน้าจออนุมัติของ Admin 👇 */}
                    <td>
                      <div className="avatar">
                        <div className="w-8 h-8 rounded bg-base-300">
                          <img src={getImg(item.imageUrl)} crossOrigin="anonymous" alt="item" />
                        </div>
                      </div>
                    </td>
                    <td className="text-xs">{item.sku}<br/><span className="opacity-70">{item.productName}</span></td>
                    <td className="text-right text-sm">{item.requestedQty}</td>
                    <td>
                      <input 
                        type="number" min="0" max={item.requestedQty} 
                        className="input input-sm input-bordered w-full text-center"
                        value={approvedQtys[item.productId] ?? 0}
                        onChange={(e) => setApprovedQtys({...approvedQtys, [item.productId]: parseInt(e.target.value) || 0})}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="form-control mb-4">
              <label className="label text-xs font-bold">ข้อความถึงผู้ขอเบิก / เหตุผล <span className="font-normal opacity-60">(จำเป็นเมื่อปฏิเสธ หรืออนุมัติไม่ครบตามจำนวน)</span></label>
              <textarea
                className="textarea textarea-bordered w-full"
                rows="2"
                placeholder="เช่น สต็อกไม่พอ จ่ายได้บางส่วน / ข้อมูลใบเบิกไม่ครบถ้วน"
                value={approveMessage}
                onChange={(e) => setApproveMessage(e.target.value)}
              ></textarea>
            </div>
            <div className="flex justify-end gap-3 pt-4 border-t border-base-200">
              <button className="btn btn-ghost" onClick={() => setApproveModal(null)}>ยกเลิก</button>
              <button className="btn btn-error text-white" onClick={() => handleApproveSubmit('REJECT')}>ไม่อนุมัติ (Reject All)</button>
              <button className="btn btn-success text-white" onClick={() => handleApproveSubmit('APPROVE')}>บันทึกการอนุมัติ (Approve)</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal สำหรับการเลือก Export */}
      {exportModalOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center backdrop-blur-md">
          <div className="bg-base-100 p-6 rounded-2xl shadow-2xl border border-base-200 max-w-md w-full">
            <h3 className="font-bold text-lg border-b border-base-200 pb-3 mb-4 flex items-center gap-2">📄 เลือกเงื่อนไขการสร้างรายงาน</h3>
            <div className="space-y-4 mb-6">
              <div className="form-control">
                <label className="label text-sm font-bold">ประเภทรายงาน</label>
                <select className="select select-bordered w-full" value={exportType} onChange={handleExportTypeChange}>
                  <option value="day">รายวัน (Daily)</option>
                  <option value="month">รายเดือน (Monthly)</option>
                  <option value="year">รายปี (Yearly)</option>
                </select>
              </div>
              <div className="form-control">
                <label className="label text-sm font-bold">ระบุ {exportType === 'day' ? 'วันที่' : exportType === 'month' ? 'เดือน' : 'ปี'}</label>
                {exportType === 'day' && <input type="date" className="input input-bordered w-full" value={exportValue} onChange={e => setExportValue(e.target.value)} />}
                {exportType === 'month' && <input type="month" className="input input-bordered w-full" value={exportValue} onChange={e => setExportValue(e.target.value)} />}
                {exportType === 'year' && <input type="number" min="2020" max="2100" className="input input-bordered w-full" value={exportValue} onChange={e => setExportValue(e.target.value)} />}
              </div>
              <div className="bg-base-200 p-3 rounded-lg text-sm text-center">
                พบข้อมูลที่ตรงกับเงื่อนไข: <strong className="text-primary">{exportFilteredLogs.length}</strong> รายการ
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-4 border-t border-base-200">
              <button className="btn btn-ghost" onClick={() => setExportModalOpen(false)}>ยกเลิก</button>
              <button className="btn btn-primary text-white" onClick={executePDFExport} disabled={exportFilteredLogs.length === 0}>
                พิมพ์ / บันทึกเป็น PDF
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
