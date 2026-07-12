import { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { isCameraScanDevice } from '../utils/device';
import { classifyScanResponse, hasExactScannedProduct, resolveProductQrScan } from '../utils/productQrScan';

// วงจรสแกนป้ายเพื่อค้นหาสินค้าที่ใช้ร่วมกันใน Products และ Inventory
export const useWarehouseProductScan = ({
  searchTerm,
  setSearchTerm,
  groupFilter,
  setGroupFilter,
  lowStockOnly = false,
  searchParams = null,
  setSearchParams = null
}) => {
  const [scanOpen, setScanOpen] = useState(false);
  const [scanArmed, setScanArmed] = useState(false);
  const [scanVersion, setScanVersion] = useState(0);
  const searchInputRef = useRef(null);
  const scanTimerRef = useRef(null);
  const scanPreviousSearchRef = useRef('');
  const pendingScannedItemIdRef = useRef(null);
  const scanSequenceRef = useRef(0);
  const currentSearchContextRef = useRef({ searchTerm, groupFilter, lowStockOnly });
  currentSearchContextRef.current = { searchTerm, groupFilter, lowStockOnly };

  useEffect(() => () => clearTimeout(scanTimerRef.current), []);

  const handleScanClick = () => {
    pendingScannedItemIdRef.current = null;
    scanPreviousSearchRef.current = searchTerm;
    if (isCameraScanDevice()) {
      setScanOpen(true);
      return;
    }

    setScanArmed(true);
    searchInputRef.current?.focus();
    searchInputRef.current?.select();
    toast('พร้อมสแกน — ยิง QR ได้เลย (กด Esc หรือคลิกออกเพื่อยกเลิก)', { icon: '🔎' });
  };

  const cancelArmedScan = useCallback(() => {
    if (!scanArmed) return;
    clearTimeout(scanTimerRef.current);
    setScanArmed(false);
    setSearchTerm(scanPreviousSearchRef.current);
  }, [scanArmed, setSearchTerm]);

  const handleProductScan = useCallback((raw) => {
    clearTimeout(scanTimerRef.current);
    setScanArmed(false);
    setScanOpen(false);
    pendingScannedItemIdRef.current = null;

    const result = resolveProductQrScan(raw, scanPreviousSearchRef.current);
    if (!result.ok) {
      setSearchTerm(result.searchTerm);
      toast.error(result.error);
      return;
    }

    const nextScanVersion = scanSequenceRef.current + 1;
    scanSequenceRef.current = nextScanVersion;
    pendingScannedItemIdRef.current = { itemId: result.itemId, version: nextScanVersion };
    setSearchTerm(result.searchTerm);
    setGroupFilter('');
    setScanVersion(nextScanVersion); // ทำให้ค้นหาใหม่ได้แม้สแกน QR เดิมซ้ำ

    if (lowStockOnly && searchParams && setSearchParams) {
      const next = new URLSearchParams(searchParams);
      next.delete('filter');
      setSearchParams(next, { replace: true });
    }
  }, [lowStockOnly, searchParams, setGroupFilter, setSearchParams, setSearchTerm]);

  const handleSearchChange = (event) => {
    const value = event.target.value;
    setSearchTerm(value);
    if (!scanArmed) {
      pendingScannedItemIdRef.current = null;
      return;
    }

    clearTimeout(scanTimerRef.current);
    // เครื่องสแกนบางรุ่นไม่ส่ง Enter: รอให้รับรหัสครบก่อน parse เพื่อไม่รับ 9 ตัวแรกของรหัสที่ยาวเกิน
    scanTimerRef.current = setTimeout(() => handleProductScan(value), 180);
  };

  const handleSearchKeyDown = (event) => {
    if (!scanArmed) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      cancelArmedScan();
      return;
    }
    if (event.key !== 'Enter') return;
    event.preventDefault();
    handleProductScan(event.currentTarget.value);
  };

  const completePendingScan = useCallback((products, requestScanVersion) => {
    const pendingScan = pendingScannedItemIdRef.current;
    const responseState = classifyScanResponse(
      pendingScan,
      requestScanVersion,
      currentSearchContextRef.current
    );
    if (responseState === 'ignore') return;

    pendingScannedItemIdRef.current = null;
    if (responseState === 'cancelled') return;

    if (hasExactScannedProduct(products, pendingScan.itemId)) {
      toast.success(`พบสินค้ารหัส ${pendingScan.itemId}`);
    } else {
      toast.error(`ไม่พบสินค้ารหัส ${pendingScan.itemId}`);
    }
  }, []);

  const failPendingScan = useCallback((requestScanVersion) => {
    const pendingScan = pendingScannedItemIdRef.current;
    const responseState = classifyScanResponse(
      pendingScan,
      requestScanVersion,
      currentSearchContextRef.current
    );
    if (responseState === 'ignore') return;

    pendingScannedItemIdRef.current = null;
    if (responseState === 'cancelled') return;
    toast.error('ค้นหาสินค้าจาก QR ไม่สำเร็จ กรุณาลองใหม่');
  }, []);

  return {
    scanOpen,
    closeScanner: () => setScanOpen(false),
    scanVersion,
    searchInputRef,
    handleScanClick,
    handleProductScan,
    handleSearchChange,
    handleSearchKeyDown,
    cancelArmedScan,
    completePendingScan,
    failPendingScan
  };
};
