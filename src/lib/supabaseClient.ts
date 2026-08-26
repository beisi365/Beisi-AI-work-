import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Supabase 客户端单例。仅在配置了 VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY 时可用；
 * 未配置（纯前端单机 / 演示）时返回 null，应用回退到 LocalDataLayer。
 *
 * 注意：anon key 是公开的前端密钥，本身不安全——真正的安全边界是 schema.sql 里的
 * RLS 行级策略（教师仅见自己班 / 学员仅见自己）。务必保证 RLS 已开启且校验通过。
 */

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isSupabaseEnabled = Boolean(url && anonKey);

let _client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!_client) {
    if (!url || !anonKey) {
      throw new Error('Supabase 未配置：缺少 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY');
    }
    _client = createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    });
  }
  return _client;
}

/** 表名（snake_case）→ supabase from() 访问器，统一入口便于替换/测试 */
export function table(client: SupabaseClient, name: string) {
  return client.from(name);
}
