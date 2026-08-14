import type { DataLayer } from './DataLayer';
import { LocalDataLayer } from './LocalDataLayer';

/** 当前启用的数据层实现；未来接 Supabase/CloudBase 仅改这里 */
export const db: DataLayer = new LocalDataLayer();

export { LocalDataLayer };
export * from './DataLayer';
export { canRead, canWrite } from './permissions';
