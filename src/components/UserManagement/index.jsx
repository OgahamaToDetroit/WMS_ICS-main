// src/components/UserManagement/index.jsx
import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { fetchApi, getAssetUrl } from '../../utils/api';

export default function UserManagement() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const currentUser = JSON.parse(sessionStorage.getItem('currentUser') || '{}');

  const fetchUsers = async () => {
    try {
      const data = await fetchApi('/api/users');
      if (data.success) setUsers(data.users);
    } catch (err) {
      console.error('Error fetching users:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleRoleChange = async (userId, newRole) => {
    try {
      const data = await fetchApi(`/api/users/${userId}/role`, {
        method: 'PUT',
        body: JSON.stringify({ role: newRole })
      });
      if (data.success) {
        setUsers(users.map(u => u.id === userId ? { ...u, role: newRole } : u));
        toast.success('อัปเดตบทบาทผู้ใช้สำเร็จ');
      }
    } catch (err) {
      console.error('Role update failed', err);
    }
  };

  const handleStatusChange = async (userId, newStatus) => {
    const isConfirm = window.confirm(`คุณแน่ใจหรือไม่ที่จะเปลี่ยนสถานะผู้ใช้นี้เป็น ${newStatus}?`);
    if (!isConfirm) return;

    try {
      const data = await fetchApi(`/api/users/${userId}/status`, {
        method: 'PUT',
        body: JSON.stringify({ status: newStatus })
      });
      
      if (data.success) {
        setUsers(users.map(u => u.id === userId ? { ...u, status: newStatus } : u));
        toast.success('อัปเดตสถานะและส่งอีเมลแจ้งเตือนสำเร็จ');
      }
    } catch (err) {
      console.error('Status update failed', err);
    }
  };

  // 👇 ฟังก์ชันใหม่สำหรับลบผู้ใช้งาน
  const handleDeleteUser = async (userId, username) => {
    const isConfirm = window.confirm(`⚠️ คำเตือน: คุณแน่ใจหรือไม่ที่จะลบผู้ใช้ "${username}" ออกจากระบบถาวร?`);
    if (!isConfirm) return;

    try {
      const data = await fetchApi(`/api/users/${userId}`, {
        method: 'DELETE'
      });
      
      if (data.success) {
        // เอารายชื่อคนที่ถูกลบออกจากตารางทันทีโดยไม่ต้องรีเฟรชหน้า
        setUsers(users.filter(u => u.id !== userId));
        toast.success('ลบผู้ใช้งานสำเร็จ');
      }
    } catch (err) {
      // fetchApi แสดง toast ข้อความ error จาก server ให้แล้ว
      console.error('Delete user failed', err);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex justify-between items-center bg-base-100/60 backdrop-blur-lg p-5 rounded-2xl shadow-sm border border-base-200">
        <div>
          <h1 className="text-2xl font-bold text-base-content">จัดการผู้ใช้งาน (Users & Roles)</h1>
          <p className="text-sm text-base-content/60">อนุมัติคำขอสมัครสมาชิกและกำหนดสิทธิ์ (RBAC)</p>
        </div>
      </div>

      <div className="card bg-base-100/70 backdrop-blur-xl shadow-xl border border-base-200 overflow-hidden min-h-[300px]">
        {loading ? (
          <div className="flex flex-col justify-center items-center h-[300px] gap-3">
            <span className="loading loading-spinner loading-lg text-primary"></span>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table w-full">
              <thead className="bg-base-200/50">
                <tr>
                  <th>ชื่อผู้ใช้งาน</th>
                  <th>อีเมล</th>
                  <th>บทบาท (Role)</th>
                  <th>สถานะ (Status)</th>
                  <th>การอนุมัติ / การจัดการ</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id} className="hover:bg-base-200/40">
                    <td className="font-medium flex items-center gap-3">
                      <div className="avatar">
                        <div className="w-8 h-8 rounded-full border border-base-300 overflow-hidden">
                          <img src={getAssetUrl(user.avatarUrl) || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.username)}&background=random`} alt="avatar" />
                        </div>
                      </div>
                      {user.username}
                    </td>
                    <td className="text-sm opacity-80">{user.email}</td>
                    <td>
                      <select 
                        className="select select-bordered select-xs w-full max-w-[120px]"
                        value={user.role}
                        onChange={(e) => handleRoleChange(user.id, e.target.value)}
                        disabled={user.username === currentUser.username}
                      >
                        <option value="Admin">Admin</option>
                        <option value="Manager">Manager</option>
                        <option value="Operator">Operator</option>
                      </select>
                    </td>
                    <td>
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${
                          user.status === 'Active' ? 'bg-success' : 
                          user.status === 'Denied' ? 'bg-error' : 'bg-warning animate-pulse'
                        }`}></div>
                        <span className="text-xs font-bold opacity-80">{user.status}</span>
                      </div>
                    </td>
                    <td>
                      <div className="flex items-center gap-2">
                        {/* ถ้าเป็น Pending จะโชว์ปุ่ม Accept/Deny */}
                        {user.status === 'Pending' ? (
                          <>
                            <button onClick={() => handleStatusChange(user.id, 'Active')} className="btn btn-xs btn-success text-white shadow-sm">Accept</button>
                            <button onClick={() => handleStatusChange(user.id, 'Denied')} className="btn btn-xs btn-warning text-white shadow-sm">Deny</button>
                          </>
                        ) : (
                          // ถ้าอนุมัติแล้ว โชว์คำว่าจัดการแล้ว
                          <span className="text-xs opacity-50 italic mr-2">ดำเนินการแล้ว</span>
                        )}

                        {/* 👇 ปุ่มลบผู้ใช้งาน (ซ่อนไม่ให้ตัวเองเห็นปุ่มลบตัวเอง) */}
                        {user.username !== currentUser.username && (
                          <button 
                            onClick={() => handleDeleteUser(user.id, user.username)} 
                            className="btn btn-xs btn-error text-white shadow-sm"
                            title="ลบผู้ใช้งานออกจากระบบ"
                          >
                            ลบ
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
