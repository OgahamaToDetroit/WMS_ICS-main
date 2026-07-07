// src/components/Inventory/index.jsx
import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { fetchApi, getAssetUrl } from '../../utils/api';
import toast from 'react-hot-toast';

// ฟังก์ชันดึงรูปภาพ (ถ้าไม่มีรูปให้ใช้รูป SVG เปล่าๆ แทน เพื่อกันพัง)
const getImg = (url) => {
  if (!url) return "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMDAiIGhlaWdodD0iMTAwIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZjNmNGY2Ii8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtc2l6ZT0iMTIiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGFsaWdubWVudC1iYXNlbGluZT0ibWlkZGxlIiBmb250LWZhbWlseT0ic2Fucy1zZXJpZiIgZmlsbD0iIzliOWI5YiI+Tm8gSW1hZ2U8L3RleHQ+PC9zdmc+";
  return getAssetUrl(url);
};

export default function Inventory() {
  const [searchParams] = useSearchParams();

  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  // ระบบตะกร้าสินค้า
  const [cart, setCart] = useState([]);
  const [cartModal, setCartModal] = useState(false);
  const [reqProject, setReqProject] = useState('');

  // ค้นหาผ่านฝั่ง server เพื่อให้เจอสินค้าทุกตัว ไม่ติดเพดานจำนวนรายการที่โหลดมาแสดง
  // silent = รีเฟรชเบื้องหลังโดยไม่โชว์ spinner (ใช้ตอน poll อัตโนมัติ)
  const fetchProducts = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const query = searchTerm.trim()
        ? `?limit=500&search=${encodeURIComponent(searchTerm.trim())}`
        : '?limit=500';
      const json = await fetchApi(`/api/products${query}`);
      if (json.success) setData(json.products);
    } catch (error) {
      console.warn('Failed to fetch products', error);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [searchTerm]);

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
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', refresh);
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
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-base-100 p-5 rounded-2xl shadow-sm border border-base-200">
        <div>
          <h1 className="text-2xl font-bold">จัดการสินค้าคงคลัง</h1>
          <p className="text-sm text-base-content/60 mt-1">เลือกสินค้าที่ต้องการเบิกลงในใบเบิก แล้วส่งคำขอให้ผู้ดูแลอนุมัติ</p>
        </div>
      </div>

      <div className="card bg-base-100 shadow-xl border border-base-200 overflow-hidden flex flex-col">
        <div className="p-4 border-b border-base-200 flex justify-between items-center bg-base-200/30">
          <input
            type="text" placeholder="🔍 ค้นหา SKU หรือ ชื่อ..."
            className="input input-sm input-bordered w-full max-w-xs bg-base-100"
            value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        
        <div className="overflow-x-auto">
          {loading ? ( <div className="flex justify-center p-10"><span className="loading loading-spinner text-primary"></span></div> ) : (
            <table className="table table-sm w-full">
              <thead className="bg-base-200/50">
                <tr><th>รูปภาพ</th><th>SKU</th><th>ชื่อสินค้า</th><th>คงเหลือ</th><th>สถานะ</th><th>เบิก</th></tr>
              </thead>
              <tbody>
                {filteredData.map((item) => (
                  <tr key={item.id} className="hover:bg-base-200/40">
                    {/* 👇 แสดงรูปภาพสินค้า 👇 */}
                    <td>
                      <div className="avatar">
                        <div className="w-10 h-10 rounded bg-base-300">
                          <img src={getImg(item.imageUrl)} crossOrigin="anonymous" alt={item.sku} />
                        </div>
                      </div>
                    </td>
                    <td className="font-mono text-xs font-semibold">{item.sku}</td>
                    <td className="text-sm font-medium">{item.name}</td>
                    <td className="font-bold">{item.stock}</td>
                    <td><span className={`badge badge-sm text-white ${item.stock > 20 ? 'badge-success' : item.stock > 0 ? 'badge-warning' : 'badge-error'}`}>{item.status}</span></td>
                    <td>
                      <button onClick={() => addToCart(item)} disabled={item.stock === 0} className="btn btn-primary btn-xs">เพิ่มลงใบเบิก</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {cart.length > 0 && (
        <div className="fixed bottom-6 right-6 z-50">
          <button onClick={() => setCartModal(true)} className="btn btn-primary shadow-2xl rounded-full px-6 h-14 animate-bounce">
            🛒 ตะกร้าใบเบิก <div className="badge badge-error badge-sm text-white ml-2">{cart.length}</div>
          </button>
        </div>
      )}

      {/* Modal ตะกร้าใบเบิก */}
      {cartModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center backdrop-blur-md">
          <div className="bg-base-100 p-6 rounded-2xl w-full max-w-lg shadow-2xl border border-base-200">
            <h3 className="font-bold text-lg border-b border-base-200 pb-3 mb-4">📝 สรุปใบรายการเบิกสินค้า</h3>
            <div className="space-y-3 max-h-60 overflow-y-auto mb-4 p-2 bg-base-200/50 rounded-lg">
              {cart.map((item, idx) => (
                <div key={idx} className="flex justify-between items-center bg-base-100 p-2 rounded-lg border border-base-200">
                  <div className="flex items-center gap-3">
                    {/* 👇 แสดงรูปในตะกร้า 👇 */}
                    <div className="avatar">
                      <div className="w-10 h-10 rounded">
                        <img src={getImg(item.imageUrl)} crossOrigin="anonymous" alt="product" />
                      </div>
                    </div>
                    <div className="text-xs">
                      <p className="font-bold">{item.sku}</p>
                      <p className="opacity-70 truncate w-32">{item.productName}</p>
                      <p className="opacity-50">คงเหลือ {item.stock}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="join">
                      <button
                        type="button"
                        className="btn btn-xs join-item"
                        onClick={() => stepCartQty(item, -1)}
                        disabled={(Number(item.quantity) || 0) <= 1}
                      >−</button>
                      <input
                        type="number" min="1" max={item.stock}
                        className="input input-xs input-bordered join-item w-14 text-center"
                        value={item.quantity}
                        onChange={(e) => setCartQty(item.productId, e.target.value)}
                        onBlur={() => setCartQty(item.productId, Math.min(Math.max(Number(item.quantity) || 1, 1), item.stock))}
                      />
                      <button
                        type="button"
                        className="btn btn-xs join-item"
                        onClick={() => stepCartQty(item, 1)}
                        disabled={(Number(item.quantity) || 0) >= item.stock}
                      >+</button>
                    </div>
                    <button onClick={() => removeFromCart(item.productId)} className="btn btn-xs btn-error btn-circle text-white">✕</button>
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

    </div>
  );
}
