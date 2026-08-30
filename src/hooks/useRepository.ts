import { useCallback, useEffect, useRef, useState } from 'react';
import { db as defaultDb } from '../data/repository';
import type { DataLayer } from '../data/repository/DataLayer';
import type { TableName } from '../data/types';

/**
 * 订阅数据层变化的取数 Hook。
 * 任何被订阅表的写操作都会触发 reload，页面自动刷新——
 * 页面永远不直接读/写浏览器本地存储，只通过 DataLayer。
 *
 * 返回的 `reload` 可在写操作后显式调用，强制重新拉取，
 * 不依赖 Realtime 推播是否开启（双保险，避免「写进了但界面不刷新」）。
 */
export function useRepository<T>(
  tables: TableName[],
  run: (db: DataLayer) => Promise<T> | T,
  dataLayer: DataLayer = defaultDb,
) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const runRef = useRef(run);
  runRef.current = run;

  const reload = useCallback(async () => {
    try {
      const r = await runRef.current(dataLayer);
      setData(r);
      setError(null);
    } catch (e) {
      setError(e as Error);
    } finally {
      setLoading(false);
    }
  }, [dataLayer]);

  useEffect(() => {
    let alive = true;
    const wrapped = () => {
      if (alive) void reload();
    };
    void reload();
    const unsub = dataLayer.subscribe(tables, wrapped);
    return () => {
      alive = false;
      unsub();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataLayer, tables.join(',')]);

  return { data, loading, error, reload };
}
