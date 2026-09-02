// AI 培训学习工作台 · Service Worker（pass-through，不再缓存）
// 旧策略（stale-while-revalidate）会把首页死死钉在旧版本，QA 发布新代码后用户看到的还是
// 上一版的应用外壳，导致「4173 首页不对 / 登录信息入口重复」这种明明已经修过却复现的现象。
// 这里改为：所有请求不拦截，直接走网络；只保留安装 + 激活钩子用于清理历史缓存。
// 后续如需重新启用离线缓存，建议改成"编译期内嵌版本号 + 服务端响应 cache-control no-cache"。
const CACHE = 'awb-cache-v2';

self.addEventListener('install', (event) => {
  // 立即接管：跳过 waiting，让新的 SW 取代旧的
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // 清掉历史缓存，确保磁盘上的旧资源也被释放
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  // 不拦截任何 GET 请求，全部交回浏览器默认的网络层
  return;
});
