import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  server: {
    host: true, // เปิดรับจากเครื่องอื่นในวง LAN (มือถือดู layout ได้ — กล้อง/SW/push ต้อง secure context)
    proxy: {
      '/api': {
        target: 'http://localhost:5000', // backend รันที่พอร์ต 5000
        changeOrigin: true,
        secure: false,
      },
      '/uploads': {
        target:   'http://localhost:5000',
        changeOrigin: true,
        secure:   false
      }
    }
  }
});
