import type { DataLayer } from './DataLayer';
import { LocalDataLayer } from './LocalDataLayer';
import { isSupabaseEnabled } from '../../lib/supabaseClient';
import { SupabaseDataLayer } from './SupabaseDataLayer';

/**
 * 当前启用的数据层实现：
 * - 配置了 VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY → SupabaseDataLayer（多用户云端）
 * - 未配置 → LocalDataLayer（纯前端单机 / 演示），行为与历史完全一致
 * 未来接其他后端仅改这里。
 */
export const db: DataLayer = isSupabaseEnabled ? new SupabaseDataLayer() : new LocalDataLayer();

export { LocalDataLayer, SupabaseDataLayer };
export * from './DataLayer';
export { canRead, canWrite } from './permissions';
