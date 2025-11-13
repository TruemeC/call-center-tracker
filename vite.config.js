import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// تم تحديث المسار الأساسي ليطابق اسم المستودع call-center-tracker/
export default defineConfig({
  plugins: [react()],
  base: '/call-center-tracker/', 
});
