/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/**/*.test.ts'],
    // 单元测试强制走 LocalDataLayer：本机 .env 一旦配置了 Supabase，数据层会切到
    // SupabaseDataLayer，而它不支持 reset()（云端共享数据不可重置），会让大量依赖
    // 「reset 播种」的用例假失败，掩盖真实回归。故测试环境清空这两个开关变量。
    env: {
      VITE_SUPABASE_URL: '',
      VITE_SUPABASE_ANON_KEY: '',
    },
  },
});
