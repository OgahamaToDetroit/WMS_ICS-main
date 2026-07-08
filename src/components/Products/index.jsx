import React, { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { fetchApi, getAssetUrl } from '../../utils/api';
import { toCsv } from '../../utils/csv';

const emptyInboundForm = {
  sku: '',
  name: '',
  quantity: '',
  minStock: 10,
  note: ''
};

// minStock ช่องว่าง = "ยังไม่ตั้งเกณฑ์" (NULL ในฐาน) — ห้ามตั้ง default เป็นตัวเลข
// ไม่งั้นเปิดฟอร์มแล้วกดบันทึกเฉยๆ จะกลายเป็นการตั้งเกณฑ์โดยไม่ตั้งใจ
// groupId ว่างจนกว่าผู้ใช้จะเลือก — รหัสสินค้าระบบออกให้ตามกลุ่ม พิมพ์เองไม่ได้แล้ว
const emptyProductForm = {
  sku: '',
  name: '',
  unit: '',
  vendor: '',
  groupId: '',
  latestCost: '',
  minStock: '',
  imageUrl: '',
  initialStock: ''
};

const imageFallback = "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxNjAiIGhlaWdodD0iMTIwIj48cmVjdCB3aWR0aD0iMTYwIiBoZWlnaHQ9IjEyMCIgZmlsbD0iI2YzZjRmNiIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBmb250LXNpemU9IjE0IiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBhbGlnbm1lbnQtYmFzZWxpbmU9Im1pZGRsZSIgZm9udC1mYW1pbHk9InNhbnMtc2VyaWYiIGZpbGw9IiM5YjliOWIiPk5vIEltYWdlPC90ZXh0Pjwvc3ZnPg==";

const csvHeaders = ['sku', 'name', 'unit', 'vendor', 'stock', 'minStock', 'latestCost', 'imageUrl', 'status'];

export default function Products() {
  const currentUser = JSON.parse(sessionStorage.getItem('currentUser') || '{}');
  const canArchive = currentUser.role === 'Admin';
  const [products, setProducts] = useState([]);
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [inboundModal, setInboundModal] = useState(false);
  const [inboundForm, setInboundForm] = useState(emptyInboundForm);
  const [productModal, setProductModal] = useState(false);
  const [editingSku, setEditingSku] = useState(null);
  const [productForm, setProductForm] = useState(emptyProductForm);
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // silent = รีเฟรชเบื้องหลังโดยไม่โชว์ spinner (ใช้ตอน poll อัตโนมัติ)
  const fetchProducts = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const query = searchTerm.trim() ? `?limit=500&search=${encodeURIComponent(searchTerm.trim())}` : '?limit=500';
      const json = await fetchApi(`/api/products${query}`);
      if (json.success) setProducts(json.products);
    } catch (err) {
      console.error('Fetch products error:', err);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [searchTerm]);

  // debounce กันยิง request ทุกตัวอักษรที่พิมพ์ค้นหา
  useEffect(() => {
    const timer = setTimeout(fetchProducts, 300);
    return () => clearTimeout(timer);
  }, [fetchProducts]);

  // อัปเดตยอดสต็อกอัตโนมัติทุก 30 วินาที + ตอนสลับกลับมาที่แท็บ
  useEffect(() => {
    const refresh = () => fetchProducts({ silent: true });
    const interval = setInterval(refresh, 30000);
    window.addEventListener('focus', refresh);
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', refresh);
    };
  }, [fetchProducts]);

  const openInboundModal = (product = null) => {
    setInboundForm(product ? {
      sku: product.sku,
      name: product.name,
      quantity: '',
      minStock: product.minStock || 10,
      note: ''
    } : emptyInboundForm);
    setInboundModal(true);
  };

  const openProductModal = async (product = null) => {
    if (product) {
      setEditingSku(product.sku);
      setProductForm({
        sku: product.sku,
        name: product.name,
        unit: product.unit || '',
        vendor: product.vendor || '',
        groupId: '',
        latestCost: product.latestCost ?? '',
        // NULL = ยังไม่ตั้งเกณฑ์ → แสดงช่องว่างตามจริง (?? 10 เดิมคือกับดักเสกเกณฑ์ทับ NULL ตอนบันทึก)
        minStock: product.minStock ?? '',
        imageUrl: product.imageUrl || '',
        initialStock: ''
      });
      setImagePreview(product.imageUrl ? getAssetUrl(product.imageUrl) : '');
    } else {
      // โหมดสร้าง: ต้องมีรายชื่อกลุ่มให้เลือกก่อน (ระบบออกรหัสให้ตามกลุ่ม) — โหลดครั้งแรกครั้งเดียว
      if (groups.length === 0) {
        try {
          const json = await fetchApi('/api/product-groups');
          if (json.success) setGroups(json.groups);
        } catch (err) {
          console.error('Fetch product groups error:', err);
        }
      }
      setEditingSku(null);
      setProductForm(emptyProductForm);
      setImagePreview('');
    }
    setImageFile(null);
    setProductModal(true);
  };

  const handleImageChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const submitInbound = async (event) => {
    event.preventDefault();
    if (!inboundForm.sku.trim() || !inboundForm.name.trim()) return toast.error('กรุณาระบุ SKU และชื่ออะไหล่');
    if (!inboundForm.quantity || Number(inboundForm.quantity) <= 0) return toast.error('จำนวนรับเข้าต้องมากกว่า 0');

    setSubmitting(true);
    try {
      const json = await fetchApi('/api/transactions/inbound', {
        method: 'POST',
        body: JSON.stringify({
          sku: inboundForm.sku,
          name: inboundForm.name,
          quantity: Number(inboundForm.quantity),
          minStock: Number(inboundForm.minStock) || 10,
          note: inboundForm.note
        })
      });

      if (json.success) {
        toast.success('บันทึกรับอะไหล่เข้าสำเร็จ');
        setInboundModal(false);
        setInboundForm(emptyInboundForm);
        await fetchProducts();
      }
    } catch (err) {
      console.error('Inbound failed:', err);
    } finally {
      setSubmitting(false);
    }
  };

  const submitProduct = async (event) => {
    event.preventDefault();
    if (!productForm.name.trim()) return toast.error('กรุณาระบุชื่อสินค้า');
    if (!editingSku && !productForm.groupId) return toast.error('กรุณาเลือกกลุ่มสินค้า');

    setSubmitting(true);
    try {
      // อัปโหลดรูปใหม่ก่อน (ถ้ามีการเลือกไฟล์) แล้วค่อยบันทึกข้อมูลสินค้าพร้อม URL ที่ได้
      let imageUrl = productForm.imageUrl;
      if (imageFile) {
        const formData = new FormData();
        formData.append('image', imageFile);
        const uploadRes = await fetchApi('/api/upload-product-image', {
          method: 'POST',
          body: formData
        });
        if (uploadRes.success) imageUrl = uploadRes.fileUrl;
      }

      const endpoint = editingSku ? `/api/products/${encodeURIComponent(editingSku)}` : '/api/products';
      const method = editingSku ? 'PUT' : 'POST';
      // ช่องว่าง = null (ยังไม่ตั้งเกณฑ์ / ไม่รู้ราคา) — ห้ามแปลงเป็น 0 หรือ 10 เงียบๆ
      const payload = {
        name: productForm.name,
        unit: productForm.unit,
        vendor: productForm.vendor,
        imageUrl,
        latestCost: productForm.latestCost === '' ? null : Number(productForm.latestCost),
        minStock: productForm.minStock === '' ? null : Number(productForm.minStock),
        // โหมดสร้างส่งแค่กลุ่ม — รหัสสินค้าระบบเป็นคนออกให้ (MAX+1 ในกลุ่ม) ไม่มีการพิมพ์เอง
        ...(editingSku ? {} : {
          groupId: productForm.groupId,
          initialStock: productForm.initialStock === '' ? null : Number(productForm.initialStock)
        })
      };

      const json = await fetchApi(endpoint, {
        method,
        body: JSON.stringify(payload)
      });

      if (json.success) {
        toast.success(editingSku ? 'อัปเดตสินค้าเรียบร้อย' : `สร้างสินค้าเรียบร้อย — ได้รหัส ${json.sku}`);
        if (json.warning) toast(json.warning, { icon: '⚠️' });
        setProductModal(false);
        await fetchProducts();
      }
    } catch (err) {
      console.error('Product save failed:', err);
    } finally {
      setSubmitting(false);
    }
  };

  const archiveProduct = async (product) => {
    if (!window.confirm(`ปิดใช้งานสินค้า ${product.sku}?`)) return;
    try {
      const json = await fetchApi(`/api/products/${encodeURIComponent(product.sku)}`, { method: 'DELETE' });
      if (json.success) {
        toast.success('ปิดใช้งานสินค้าเรียบร้อย');
        await fetchProducts();
      }
    } catch (err) {
      console.error('Archive product failed:', err);
    }
  };

  const exportProducts = () => {
    const rows = products.map(item => ({
      sku: item.sku,
      name: item.name,
      unit: item.unit,
      vendor: item.vendor,
      stock: item.stock,
      minStock: item.minStock,
      latestCost: item.latestCost,
      imageUrl: item.imageUrl,
      status: item.status
    }));
    const csv = toCsv(rows, csvHeaders);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `WMS_Products_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const filteredProducts = products.filter(item => (
    item.sku.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (item.vendor || '').toLowerCase().includes(searchTerm.toLowerCase())
  ));

  return (
    <div className="space-y-6 animate-fade-in relative">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-base-100/60 backdrop-blur-lg p-5 rounded-2xl shadow-sm border border-base-200">
        <div>
          <h1 className="text-2xl font-bold text-base-content">รายการอะไหล่ (Spare Parts)</h1>
          <p className="text-sm text-base-content/60 mt-1">จัดการ master data, จุดเตือนขั้นต่ำ, ส่งออก CSV และบันทึกรับเข้า</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-ghost btn-sm" onClick={exportProducts} disabled={products.length === 0}>Export CSV</button>
          {/* ปุ่ม Import CSV ถูกพักตามการตัดสินใจ DATABASE.md ข้อ 6.11 — ช่องรับรหัสจากไฟล์ตรงๆ เลี่ยงระบบออกรหัสตามกลุ่ม */}
          <button className="btn btn-primary btn-sm shadow-md" onClick={() => openProductModal()}>เพิ่มสินค้า</button>
        </div>
      </div>

      <div className="bg-base-100/70 border border-base-200 rounded-2xl p-4 flex flex-col sm:flex-row gap-3">
        <input
          className="input input-bordered input-sm w-full sm:max-w-xs"
          placeholder="ค้นหา SKU, ชื่อ, vendor..."
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') fetchProducts();
          }}
        />
        <button className="btn btn-sm btn-ghost" onClick={fetchProducts}>ค้นหา</button>
      </div>

      {loading ? (
        <div className="flex justify-center p-20"><span className="loading loading-spinner loading-lg text-primary"></span></div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {filteredProducts.map((item) => (
            <div key={item.id} className="card bg-base-100/70 backdrop-blur-xl shadow-xl border border-base-200 overflow-hidden hover:-translate-y-1 transition-transform group">
              <figure className="h-44 bg-white border-b border-base-200 relative overflow-hidden">
                <img src={getAssetUrl(item.imageUrl) || imageFallback} alt={item.name} className="object-cover w-full h-full group-hover:scale-105 transition-transform duration-500" />
                <div className="absolute top-2 right-2">
                  <span className={`badge font-semibold text-white shadow-sm ${item.stock > item.minStock ? 'badge-success' : item.stock > 0 ? 'badge-warning' : 'badge-error'}`}>{item.status}</span>
                </div>
              </figure>
              <div className="card-body p-5">
                <h2 className="card-title text-base leading-tight">{item.name}</h2>
                <div className="flex justify-between items-center mt-2">
                  <span className="font-mono text-sm text-base-content/60 bg-base-200 px-2 py-1 rounded">{item.sku}</span>
                  <span className="text-sm font-bold opacity-80">สต็อก: {item.stock}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs text-base-content/60">
                  {/* NULL = ยังไม่ตั้งเกณฑ์เตือน — แสดง "-" ห้ามเติมเลขแทน */}
                  <span>ขั้นต่ำ: {item.minStock ?? '-'}</span>
                  <span>หน่วย: {item.unit || '-'}</span>
                  <span className="col-span-2 truncate">Vendor: {item.vendor || '-'}</span>
                </div>
                <div className="card-actions justify-end mt-4 pt-4 border-t border-base-200">
                  <button className="btn btn-ghost btn-sm text-primary" onClick={() => openProductModal(item)}>แก้ไข</button>
                  <button className="btn btn-ghost btn-sm text-success" onClick={() => openInboundModal(item)}>รับเข้า</button>
                  {canArchive && <button className="btn btn-ghost btn-sm text-error" onClick={() => archiveProduct(item)}>ปิดใช้งาน</button>}
                </div>
              </div>
            </div>
          ))}
          {filteredProducts.length === 0 && (
            <div className="col-span-full text-center py-20 opacity-60">ไม่พบสินค้า</div>
          )}
        </div>
      )}

      {productModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center backdrop-blur-md p-4">
          <div className="bg-base-100/95 backdrop-blur-xl w-full max-w-2xl p-6 rounded-2xl border border-base-200 shadow-xl animate-fade-in">
            <h3 className="font-bold text-lg text-primary border-b border-base-200 pb-3 mb-4">{editingSku ? 'แก้ไขสินค้า' : 'เพิ่มสินค้าใหม่'}</h3>
            <form onSubmit={submitProduct} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {editingSku ? (
                  <label className="form-control">
                    <span className="label-text text-xs font-bold">รหัสสินค้า (SKU)</span>
                    <input className="input input-bordered" value={productForm.sku} disabled />
                  </label>
                ) : (
                  <label className="form-control">
                    <span className="label-text text-xs font-bold">กลุ่มสินค้า</span>
                    <select
                      className="select select-bordered"
                      value={productForm.groupId}
                      onChange={(e) => setProductForm({ ...productForm, groupId: e.target.value })}
                      required
                    >
                      <option value="" disabled>— เลือกกลุ่ม แล้วระบบจะออกรหัสให้ —</option>
                      {groups.map((group) => (
                        <option key={group.id} value={group.id}>{group.id} — {group.name}</option>
                      ))}
                    </select>
                    <span className="label-text-alt opacity-60 mt-1">รหัส 5 หลักออกอัตโนมัติ (2 ตัวแรก = กลุ่ม) — พิมพ์รหัสเองไม่ได้ กันชนกับป้าย QR เดิมในคลัง</span>
                  </label>
                )}
                <label className="form-control">
                  <span className="label-text text-xs font-bold">ชื่อสินค้า</span>
                  <input className="input input-bordered" value={productForm.name} onChange={(e) => setProductForm({ ...productForm, name: e.target.value })} required />
                </label>
                <label className="form-control">
                  <span className="label-text text-xs font-bold">หน่วย</span>
                  <input className="input input-bordered" value={productForm.unit} onChange={(e) => setProductForm({ ...productForm, unit: e.target.value })} />
                </label>
                <label className="form-control">
                  <span className="label-text text-xs font-bold">Vendor</span>
                  <input className="input input-bordered" value={productForm.vendor} onChange={(e) => setProductForm({ ...productForm, vendor: e.target.value })} />
                </label>
                <label className="form-control">
                  <span className="label-text text-xs font-bold">จุดเตือนขั้นต่ำ (Min Stock)</span>
                  <input type="number" min="0" step="any" placeholder="เว้นว่าง = ไม่ตั้งเกณฑ์เตือน" className="input input-bordered" value={productForm.minStock} onChange={(e) => setProductForm({ ...productForm, minStock: e.target.value })} />
                </label>
                <label className="form-control">
                  <span className="label-text text-xs font-bold">Latest Cost</span>
                  <input type="number" min="0" step="0.01" className="input input-bordered" value={productForm.latestCost} onChange={(e) => setProductForm({ ...productForm, latestCost: e.target.value })} />
                </label>
                {!editingSku && (
                  <label className="form-control">
                    <span className="label-text text-xs font-bold">ยอดเริ่มต้น (Initial Stock)</span>
                    <input type="number" min="0" step="any" placeholder="ระบบจะออกใบรับเข้าให้อัตโนมัติ" className="input input-bordered" value={productForm.initialStock} onChange={(e) => setProductForm({ ...productForm, initialStock: e.target.value })} />
                  </label>
                )}
                <label className="form-control sm:col-span-2">
                  <span className="label-text text-xs font-bold">รูปภาพสินค้า</span>
                  <div className="flex items-center gap-3">
                    <img
                      src={imagePreview || imageFallback}
                      alt="preview"
                      className="w-16 h-16 rounded-lg object-cover border border-base-300 bg-white shrink-0"
                    />
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="file-input file-input-bordered w-full"
                      onChange={handleImageChange}
                    />
                  </div>
                  <span className="label-text-alt opacity-60 mt-1">รองรับ JPG, PNG, WEBP ขนาดไม่เกิน 5MB</span>
                </label>
              </div>
              <div className="flex justify-end gap-3 pt-4 border-t border-base-200">
                <button type="button" className="btn btn-ghost" onClick={() => setProductModal(false)} disabled={submitting}>ยกเลิก</button>
                <button type="submit" className="btn btn-primary text-white" disabled={submitting}>
                  {submitting && <span className="loading loading-spinner loading-xs"></span>}
                  บันทึก
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {inboundModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center backdrop-blur-md p-4">
          <div className="bg-base-100/95 backdrop-blur-xl w-full max-w-md p-6 rounded-2xl border border-base-200 shadow-xl animate-fade-in">
            <h3 className="font-bold text-lg text-primary border-b border-base-200 pb-3 mb-4">รับอะไหล่เข้า</h3>
            <form onSubmit={submitInbound} className="space-y-4">
              {/* เปิดจากการ์ดสินค้าเสมอ SKU/ชื่อถูกเติมมาให้แล้ว ล็อกไว้กันพิมพ์ผิดตัว */}
              <input type="text" placeholder="SKU / Part Number" required disabled className="input input-bordered w-full" value={inboundForm.sku} />
              <input type="text" placeholder="ชื่ออะไหล่" className="input input-bordered w-full" value={inboundForm.name} onChange={e => setInboundForm({ ...inboundForm, name: e.target.value })} required />
              <div className="grid grid-cols-2 gap-3">
                <input type="number" min="1" placeholder="จำนวนรับเข้า" className="input input-bordered w-full" value={inboundForm.quantity} onChange={e => setInboundForm({ ...inboundForm, quantity: e.target.value })} required />
                <input type="number" min="0" placeholder="ขั้นต่ำ" className="input input-bordered w-full" value={inboundForm.minStock} onChange={e => setInboundForm({ ...inboundForm, minStock: e.target.value })} />
              </div>
              <textarea className="textarea textarea-bordered h-20 w-full" value={inboundForm.note} onChange={(e) => setInboundForm({ ...inboundForm, note: e.target.value })} placeholder="เลขใบส่งของ / ผู้ส่งมอบ / หมายเหตุ"></textarea>
              <div className="flex justify-end gap-3 pt-4 border-t border-base-200">
                <button type="button" className="btn btn-ghost" onClick={() => setInboundModal(false)} disabled={submitting}>ยกเลิก</button>
                <button type="submit" className="btn btn-success text-white" disabled={submitting}>
                  {submitting && <span className="loading loading-spinner loading-xs"></span>}
                  บันทึกรับเข้า
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
