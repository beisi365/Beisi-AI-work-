import { useEffect, useState } from 'react';
import { db as defaultDb } from '../data/repository';
import type { DataLayer } from '../data/repository/DataLayer';
import type { TableName } from '../data/types';

/**
 * 订阅数据层变化的取数 Hook。
 * 任何被订阅表的写操作都会触发 reload，页面自动刷新——
 * 页面永远不直接读/写浏览器本地存储，只通过 DataLayer。
 */
export function useRepository<T>(
  tables: TableName[],
  run: (db: DataLayer) => Promise<T> | T,
  dataLayer: DataLayer = defaultDb,
) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let alive = true;
    const reload = async () => {
      try {
        const r = await run(dataLayer);
        if (alive) {
          setData(r);
          setError(null);
        }
      } catch (e) {
        if (alive) setError(e as Error);
      } finally {
        if (alive) setLoading(false);
      }
    };
    reload();
    const unsub = dataLayer.subscribe(tables, reload);
    return () => {
      alive = false;
      unsub();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataLayer, tables.join(',')]);

  return { data, loading, error };
}
