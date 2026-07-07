// src/components/Settings/index.jsx
import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { fetchApi, getAssetUrl } from '../../utils/api';

export default function SettingsPage() {
  const stored = JSON.parse(sessionStorage.getItem('currentUser') || '{}');

  // State สำหรับจัดการข้อมูล
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState(stored.avatarUrl || '');
  const [username, setUsername] = useState(stored.username || '');
  const [email, setEmail] = useState(stored.email || '');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const handleAvatarChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setAvatarFile(file);
      setAvatarPreview(URL.createObjectURL(file));
    }
  };

  const handleProfileSubmit = async (e) => {
    e.preventDefault();
    if (newPassword && newPassword !== confirmPassword) return toast.error('รหัสผ่านใหม่ไม่ตรงกัน');
    
    try {
      let finalAvatarUrl = stored.avatarUrl;

      // 1. Upload รูปภาพ (ถ้ามีไฟล์ใหม่)
      if (avatarFile) {
        const formData = new FormData();
        formData.append('avatar', avatarFile);
        const data = await fetchApi('/api/upload-avatar', {
          method: 'POST',
          body: formData
        });
        if (data.success) finalAvatarUrl = data.fileUrl;
      }

      // 2. อัปเดตข้อมูล Profile และ Username
      const result = await fetchApi('/api/update-profile', {
        method: 'PUT',
        body: JSON.stringify({ 
          newUsername: username,
          email: email,
          avatarUrl: finalAvatarUrl,
          password: newPassword || undefined
        })
      });

      if (result.success) {
        toast.success('อัปเดตข้อมูลสำเร็จ!');

        // อัปเดต Token และ Session หากมีการเปลี่ยนแปลง
        if (result.token) sessionStorage.setItem('token', result.token);
        sessionStorage.setItem('currentUser', JSON.stringify({
          ...stored,
          username: result.user.username,
          avatarUrl: finalAvatarUrl,
          email: email
        }));

        // รีโหลดหน้าจอเพื่อแสดงผลชื่อใหม่บน Navbar (หน่วงให้ toast แสดงก่อน)
        setTimeout(() => window.location.reload(), 800);
      }
    } catch (err) {
      // fetchApi แสดง toast ข้อความ error จาก server ให้แล้ว
      console.error(err);
    }
  };

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h2 className="text-2xl font-bold mb-6">Settings</h2>
      <form onSubmit={handleProfileSubmit} className="space-y-6">
        
        {/* ส่วนอัปโหลดรูป */}
        <div className="flex items-center gap-4">
          <img 
            src={getAssetUrl(avatarPreview) || `https://ui-avatars.com/api/?name=${encodeURIComponent(username || 'User')}&background=0D8ABC&color=fff`} 
            alt="Avatar" 
            className="w-20 h-20 rounded-full object-cover border" 
          />
          <input type="file" onChange={handleAvatarChange} className="file-input file-input-bordered w-full max-w-xs" />
        </div>

        {/* Username */}
        <div className="form-control w-full">
          <label className="label font-semibold text-xs opacity-70">Username</label>
          <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} className="input input-bordered w-full" />
        </div>

        {/* Email */}
        <div className="form-control w-full">
          <label className="label font-semibold text-xs opacity-70">Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="input input-bordered w-full" />
        </div>

        {/* Password */}
        <div className="form-control w-full">
          <label className="label font-semibold text-xs opacity-70">รหัสผ่านใหม่ (เว้นว่างหากไม่ต้องการเปลี่ยน)</label>
          <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="input input-bordered w-full" />
        </div>

        <div className="form-control w-full">
          <label className="label font-semibold text-xs opacity-70">ยืนยันรหัสผ่านใหม่</label>
          <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="input input-bordered w-full" />
        </div>
        
        <button type="submit" className="btn btn-primary w-full sm:w-auto px-6">บันทึกข้อมูล</button>
      </form>
    </div>
  );
}
