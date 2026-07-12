// src/components/Inventory/index.jsx
import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { fetchApi, getAssetUrl } from '../../utils/api';
import { stockStatusLabel } from '../../utils/labels';
import { onServerEvent } from '../../utils/events';
import BarcodeScanner from '../BarcodeScanner';
import { ListSkeleton } from '../Skeleton';
import toast from 'react-hot-toast';
import { useWarehouseProductScan } from '../../hooks/useWarehouseProductScan';

// ฟังก์ชันดึงรูปภาพ (ถ้าไม่มีรูปให้ใช้รูป SVG เปล่าๆ แทน เพื่อกันพัง)
const getImg = (url) => {
  if (!url) return "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMDAiIGhlaWdodD0iMTAwIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZjNmNGY2Ii8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtc2l6ZT0iMTIiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGFsaWdubWVudC1iYXNlbGluZT0ibWlkZGxlIiBmb250LWZhbWlseT0ic2Fucy1zZXJpZiIgZmlsbD0iIzliOWI5YiI+Tm8gSW1hZ2U8L3RleHQ+PC9zdmc+";
  return getAssetUrl(url);
};

export default function Inventory() {
  const [searchParams] = useSearchParams();
  // Viewer ดูข้อมูลได้อย่างเดียว — ซ่อน UI การเบิกทั้งหมด (server ก็บล็อกอีกชั้น)
  const currentUser = JSON.parse(sessionStorage.getItem('currentUser') || '{}');
  const canWithdraw = currentUser.role !== 'Viewer';

  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [groups, setGroups] = useState([]);
  const [groupFilter, setGroupFilter] = useState('');
  const {
    scanOpen,
    closeScanner,
    scanVersion,
    searchInputRef,
    handleScanClick,
    handleProductScan,
    handleSearchChange,
    handleSearchKeyDown,
    cancelArmedScan,
    completePendingScan,
    failPendingScan
  } = useWarehouseProductScan({
    searchTerm,
    setSearchTerm,
    groupFilter,
    setGroupFilter
  });

  // ระบบตะกร้าสินค้า
  const [cart, setCart] = useState([]);
  const [cartModal, setCartModal] = useState(false);
  const [reqProject, setReqProject] = useState('');

  // ค้นหาผ่านฝั่ง server เพื่อให้เจอสินค้าทุกตัว ไม่ติดเพดานจำนวนรายการที่โหลดมาแสดง
  // silent = รีเฟรชเบื้องหลังโดยไม่โชว์ spinner (ใช้ตอน poll อัตโนมัติ)
  const fetchProducts = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const query = new URLSearchParams({ limit: '500' });
      if (searchTerm.trim()) query.set('search', searchTerm.trim());
      if (groupFilter) query.set('group', groupFilter);
      const json = await fetchApi(`/api/products?${query.toString()}`);
      if (json.success) {
        setData(json.products);
        completePendingScan(json.products, scanVersion);
      } else {
        failPendingScan(scanVersion);
      }
    } catch (error) {
      console.warn('Failed to fetch products', error);
      failPendingScan(scanVersion);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [searchTerm, groupFilter, scanVersion, completePendingScan, failPendingScan]);

  useEffect(() => {
    fetchApi('/api/product-groups')
      .then(json => { if (json.success) setGroups(json.groups); })
      .catch(err => console.warn('Failed to fetch groups', err));
  }, []);

  useEffect(() => {
    const timer = setTimeout(fetchProducts, 300);
    return () => clearTimeout(timer);
  }, [fetchProducts]);

  // อัปเดตยอดสต็อกอัตโนมัติทุก 30 วินาที + ตอนสลับกลับมาที่แท็บ
  // เผื่อมีคน inbound/outbound จากเครื่องอื่นระหว่างที่เปิดหน้านี้ค้างไว้
  useEffect(() => {
    const refresh = () => fetchProducts({ silent: true });
    const interval = setInterval(refresh, 30000);
    window.addEventListener('focus', refresh);
    const offProducts = onServerEvent('products', refresh);
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', refresh);
      offProducts();
    };
  }, [fetchProducts]);
  useEffect(() => {
    setSearchTerm(searchParams.get('search') || '');
  }, [searchParams]);

  const filteredData = data.filter(item =>
    item.sku.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const addToCart = (product) => {
    if (product.stock <= 0) return toast.error('สินค้านี้หมดสต็อก');
    const existing = cart.find(c => c.productId === product.id);
    if (existing) {
      const current = Number(existing.quantity) || 0;
      if (current >= product.stock) return toast.error('ขอเบิกเกินสต็อกไม่ได้');
      setCart(cart.map(c => c.productId === product.id ? { ...c, quantity: current + 1 } : c));
    } else {
      // 👇 บันทึก imageUrl ลงในตะกร้า
      setCart([...cart, { productId: product.id, sku: product.sku, productName: product.name, imageUrl: product.imageUrl, quantity: 1, stock: product.stock }]);
    }
    toast.success(`เพิ่ม ${product.sku} ลงในใบเบิกแล้ว`);
  };

  const removeFromCart = (productId) => setCart(cart.filter(c => c.productId !== productId));

  // ระหว่างพิมพ์ยอมให้ค่าเป็นอะไรก็ได้ (รวมถึงช่องว่าง) แล้วค่อยตรวจ/ปัดค่าตอน blur กับตอนส่งใบเบิก
  const setCartQty = (productId, quantity) =>
    setCart(prev => prev.map(c => (c.productId === productId ? { ...c, quantity } : c)));

  const stepCartQty = (item, delta) => {
    const next = (Number(item.quantity) || 0) + delta;
    setCartQty(item.productId, Math.min(Math.max(next, 1), item.stock));
  };

  const submitCartRequest = async (e) => {
    e.preventDefault();
    if (cart.length === 0) return toast.error('ไม่มีสินค้าในใบเบิก');
    if (!reqProject.trim()) return toast.error('กรุณาระบุชื่อโปรเจกต์');

    for (const item of cart) {
      const qty = Number(item.quantity);
      if (!Number.isInteger(qty) || qty < 1) return toast.error(`จำนวนเบิกของ ${item.sku} ไม่ถูกต้อง`);
      if (qty > item.stock) return toast.error(`${item.sku} ขอเบิกเกินสต็อกคงเหลือ (${item.stock})`);
    }

    try {
      const res = await fetchApi('/api/transactions/request', {
        method: 'POST',
        body: JSON.stringify({
          items: cart.map(c => ({ ...c, quantity: Number(c.quantity) })),
          project: reqProject
        })
      });
      if (res.success) {
        toast.success('ส่งใบคำขอเบิกสินค้าสำเร็จ');
        setCart([]);
        setReqProject('');
        setCartModal(false);
        fetchProducts();
      }
    } catch { toast.error('เกิดข้อผิดพลาด'); }
  };

  return (
    <div className="space-y-6 animate-fade-in relative pb-20">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 glass-panel p-5 rounded-2xl">
        <div>
          <h1 className="text-2xl font-bold text-gradient w-fit">จัดการสินค้าคงคลัง</h1>
          <p className="text-sm text-base-content/60 mt-1">
            {canWithdraw ? 'เลือกสินค้าที่ต้องการเบิกลงในใบเบิก แล้วส่งคำขอให้ผู้ดูแลอนุมัติ' : 'ดูข้อมูลสินค้าคงคลัง (สิทธิ์ดูอย่างเดียว)'}
          </p>
        </div>
      </div>

      <div className="card glass-panel overflow-hidden flex flex-col">
        <div className="p-4 border-b border-base-200 flex flex-col sm:flex-row gap-3 sm:items-center bg-base-200/30">
          <div className="flex gap-2 w-full max-w-xs">
            <input
              ref={searchInputRef}
              type="text" placeholder="🔍 ค้นหา รหัสสินค้า หรือ ชื่อ..."
              className="input input-sm input-bordered w-full bg-base-100"
              value={searchTerm}
              onChange={handleSearchChange}
              onKeyDown={handleSearchKeyDown}
              onBlur={cancelArmedScan}
            />
            <button type="button" onClick={handleScanClick} className="btn btn-sm btn-square btn-primary shrink-0" title="สแกนบาร์โค้ด/QR" aria-label="สแกนบาร์โค้ด">📷</button>
          </div>
          <select
            className="select select-bordered select-sm w-full max-w-57.5 bg-base-100"
            value={groupFilter}
            onChange={(e) => setGroupFilter(e.target.value)}
          >
            <option value="">ทุกหมวดหมู่</option>
            {groups.map(g => <option key={g.id} value={g.id}>{g.id} — {g.name}</option>)}
          </select>
        </div>

        {loading ? ( <ListSkeleton count={6} /> ) : (
          <>
            {/* ตาราง (จอ md ขึ้นไป) */}
            <div className="overflow-x-auto hidden md:block">
              <table className="table table-sm w-full">
                <thead className="bg-base-200/50">
                  <tr><th>รูปภาพ</th><th>รหัสสินค้า</th><th>ชื่อสินค้า</th><th>หมวดหมู่</th><th>คงเหลือ</th><th>สถานะ</th>{canWithdraw && <th>เบิก</th>}</tr>
                </thead>
                <tbody>
                  {filteredData.map((item) => (
                    <tr key={item.id} className="hover:bg-base-200/40">
                      <td>
                        <div className="avatar">
                          <div className="w-10 h-10 rounded bg-base-300">
                            <img src={getImg(item.imageUrl)} crossOrigin="anonymous" alt={item.sku} />
                          </div>
                        </div>
                      </td>
                      <td className="font-mono text-xs font-semibold">{item.sku}</td>
                      <td className="text-sm font-medium">{item.name}</td>
                      <td className="text-xs opacity-70">{item.groupId} — {item.groupName || 'Default'}</td>
                      <td className="font-bold">{item.stock}</td>
                      <td><span className={`badge badge-sm text-white ${item.stock > 20 ? 'badge-success' : item.stock > 0 ? 'badge-warning' : 'badge-error'}`}>{stockStatusLabel(item.status)}</span></td>
                      {canWithdraw && (
                        <td>
                          <button onClick={() => addToCart(item)} disabled={item.stock === 0} className="btn btn-primary btn-xs">เพิ่มลงใบเบิก</button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* การ์ด (จอมือถือ) */}
            <div className="md:hidden divide-y divide-base-200">
              {filteredData.map((item) => (
                <div key={item.id} className="flex items-center gap-3 p-3">
                  <div className="avatar shrink-0">
                    <div className="w-14 h-14 rounded-lg bg-base-300">
                      <img src={getImg(item.imageUrl)} crossOrigin="anonymous" alt={item.sku} />
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{item.name}</p>
                    <p className="font-mono text-xs opacity-60">{item.sku} · {item.groupId}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-sm font-bold">คงเหลือ {item.stock}</span>
                      <span className={`badge badge-xs text-white ${item.stock > 20 ? 'badge-success' : item.stock > 0 ? 'badge-warning' : 'badge-error'}`}>{stockStatusLabel(item.status)}</span>
                    </div>
                  </div>
                  {canWithdraw && (
                    <button onClick={() => addToCart(item)} disabled={item.stock === 0} className="btn btn-primary btn-sm shrink-0">เบิก</button>
                  )}
                </div>
              ))}
              {filteredData.length === 0 && <div className="text-center py-10 opacity-50 text-sm">ไม่พบสินค้า</div>}
            </div>
          </>
        )}
      </div>

      {canWithdraw && cart.length > 0 && (
        <div className="fixed bottom-6 right-6 z-50">
          <button onClick={() => setCartModal(true)} className="btn btn-primary shadow-2xl rounded-full px-6 h-14 animate-bounce">
            🛒 ตะกร้าใบเบิก <div className="badge badge-error badge-sm text-white ml-2">{cart.length}</div>
          </button>
        </div>
      )}

      {/* Modal ตะกร้าใบเบิก */}
      {cartModal && (
        <div className="fixed inset-0 z-100 flex items-start sm:items-center justify-center backdrop-blur-md p-3 pt-18 sm:p-3">
          <div className="glass-modal p-5 sm:p-6 rounded-2xl w-full max-w-lg max-h-[calc(100vh-5.5rem)] sm:max-h-[90vh] overflow-y-auto">
            <h3 className="font-bold text-lg border-b border-base-200 pb-3 mb-4">📝 สรุปใบรายการเบิกสินค้า</h3>
            <div className="space-y-3 max-h-[45vh] overflow-y-auto mb-4 p-2 bg-base-200/50 rounded-lg">
              {cart.map((item, idx) => (
                <div key={idx} className="flex justify-between items-center gap-2 bg-base-100 p-2 rounded-lg border border-base-200">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="avatar shrink-0">
                      <div className="w-10 h-10 rounded">
                        <img src={getImg(item.imageUrl)} crossOrigin="anonymous" alt="product" />
                      </div>
                    </div>
                    <div className="text-xs min-w-0">
                      <p className="font-bold">{item.sku}</p>
                      <p className="opacity-70 truncate max-w-28">{item.productName}</p>
                      <p className="opacity-50">คงเหลือ {item.stock}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="join">
                      <button
                        type="button"
                        className="btn btn-sm join-item"
                        onClick={() => stepCartQty(item, -1)}
                        disabled={(Number(item.quantity) || 0) <= 1}
                      >−</button>
                      <input
                        type="number" min="1" max={item.stock}
                        className="input input-sm input-bordered join-item w-14 text-center px-1"
                        value={item.quantity}
                        onChange={(e) => setCartQty(item.productId, e.target.value)}
                        onBlur={() => setCartQty(item.productId, Math.min(Math.max(Number(item.quantity) || 1, 1), item.stock))}
                      />
                      <button
                        type="button"
                        className="btn btn-sm join-item"
                        onClick={() => stepCartQty(item, 1)}
                        disabled={(Number(item.quantity) || 0) >= item.stock}
                      >+</button>
                    </div>
                    <button onClick={() => removeFromCart(item.productId)} className="btn btn-sm btn-error btn-circle text-white">✕</button>
                  </div>
                </div>
              ))}
            </div>
            <form onSubmit={submitCartRequest}>
              <div className="form-control mb-4">
                <label className="label text-xs font-bold">ชื่อโปรเจกต์ / เหตุผลการเบิก</label>
                <input type="text" required className="input input-bordered w-full" value={reqProject} onChange={e => setReqProject(e.target.value)} />
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" className="btn btn-ghost" onClick={() => setCartModal(false)}>ปิด</button>
                <button type="submit" className="btn btn-primary text-white">ส่งใบเบิก</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {scanOpen && (
        <BarcodeScanner
          onClose={closeScanner}
          onDetected={handleProductScan}
        />
      )}
    </div>
  );
}
