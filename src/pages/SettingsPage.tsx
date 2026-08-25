import { useRef, useState } from 'react';
import { PageHeader, Card } from '../components/ui';
import { db } from '../data/repository';
import { useDemoMode } from '../lib/demoMode';

/**
 * 系统设置 / 数据管理
 * -------------------
 * 纯前端 SPA 的数据全部存在浏览器 localStorage，无后端、无云端同步。
 * 因此「导出 / 导入」是个人数据的唯一保险：导出可下载整库 JSON 备份，
 * 导入可随时恢复（覆盖当前数据）。重置则回到内置演示数据。
 *
 * 只读演示态（readOnly）下仅允许「导出」（浏览者也可带走当前快照），
 * 「导入 / 重置」属于写操作，一律隐藏，避免分享演示链接被误改。
 */
export default function SettingsPage() {
  const { readOnly } = useDemoMode();
  const fileRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState('');

  const handleExport = async () => {
    const json = await db.exportJSON();
    const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `aiwb-backup-${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setMsg(`已导出整库备份（${Math.round(json.length / 1024)} KB）。请妥善保存此文件。`);
  };

  const handleImportClick = () => fileRef.current?.click();

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // 允许重复选择同一文件
    if (!file) return;
    if (!window.confirm('导入将覆盖当前所有数据，确定继续？此操作不可撤销。建议先导出一份备份。')) {
      return;
    }
    try {
      const text = await file.text();
      await db.importJSON(text);
      setMsg('导入成功，页面即将刷新以加载新数据…');
      window.setTimeout(() => window.location.reload(), 800);
    } catch {
      setMsg('导入失败：文件格式不正确或已损坏，请确认是「导出」生成的备份文件。');
    }
  };

  const handleReset = () => {
    if (!window.confirm('确定要重置为初始演示数据吗？所有新增 / 修改都会丢失。')) return;
    db.reset();
    window.location.reload();
  };

  return (
    <div>
      <PageHeader title="系统设置" desc="数据管理 · 备份与恢复（纯前端应用，数据存于本浏览器）" />

      <Card title="数据备份与恢复">
        <p className="setting-hint">
          本应用为纯前端，所有数据仅保存在<strong>当前浏览器</strong>，更换设备 / 清除缓存会丢失。
          「导出」可下载整库备份，「导入」可随时恢复，是个人数据的唯一保险。
        </p>

        <div className="setting-actions">
          <button className="btn btn--primary" onClick={handleExport}>
            导出数据备份
          </button>

          {!readOnly && (
            <>
              <button className="btn" onClick={handleImportClick}>
                导入数据备份
              </button>
              <button className="btn btn--danger" onClick={handleReset}>
                重置为演示数据
              </button>
            </>
          )}
          {readOnly && (
            <span className="setting-readonly-tip">只读演示模式下，导入 / 重置不可用。</span>
          )}
        </div>

        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          style={{ display: 'none' }}
          onChange={handleImportFile}
        />

        {msg && <div className="setting-msg">{msg}</div>}
      </Card>

      {!readOnly && (
        <Card title="部署与更新">
          <p className="setting-hint">
            源码托管于 GitHub（私有仓库），推送 <code>feature/teacher-control-center</code> 分支即自动部署到 Vercel，
            对外链接不变。修改代码后无需手动操作，约 1–2 分钟自动上线。
          </p>
        </Card>
      )}
    </div>
  );
}
