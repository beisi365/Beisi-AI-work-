// ============================================================
// 学员批量导入弹窗（教师）：下载模板 → 上传 CSV → 预览校验 → 确认导入。
// 纯前端 CSV 方案；写入复用 createStudent（事务/唯一校验/操作日志）。
// ============================================================
import { useEffect, useState } from 'react';
import { db } from '../data/repository';
import type { ChangeActor } from '../lib/submissionStatusGuards';
import { Button, Modal } from './ui';
import {
  buildClassMap,
  buildTemplateCsv,
  collectAccounts,
  IMPORT_COLUMNS,
  parseCsv,
  runBatchImport,
  validateImportRows,
  type BatchImportResult,
  type ImportPlanRow,
} from '../lib/studentImport';

type Step = 'upload' | 'preview' | 'done';

export function StudentImportModal({
  open,
  onClose,
  onSaved,
  actor,
}: {
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
  actor: ChangeActor;
}) {
  const [step, setStep] = useState<Step>('upload');
  const [fileName, setFileName] = useState('');
  const [plan, setPlan] = useState<ImportPlanRow[]>([]);
  const [result, setResult] = useState<BatchImportResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [classNames, setClassNames] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;
    setStep('upload');
    setFileName('');
    setPlan([]);
    setResult(null);
    setErr('');
    setSaving(false);
    db.classes
      .list()
      .then((cs) => setClassNames(cs.map((c) => c.name)))
      .catch(() => setClassNames([]));
  }, [open]);

  const validRows = () => plan.filter((p) => p.input);
  const invalidRows = () => plan.filter((p) => !p.input);

  // 下载模板（含首个真实班级名，便于直接可用）
  const downloadTemplate = () => {
    const csv = buildTemplateCsv(classNames[0]);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = '学员导入模板.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleFile = async (file: File) => {
    setErr('');
    setFileName(file.name);
    try {
      const text = await file.text();
      const parsed = parseCsv(text);
      if (parsed.headers.length === 0) {
        setErr('文件为空或无法解析，请确认是 CSV 格式');
        return;
      }
      const missing = IMPORT_COLUMNS.filter(
        (c) => c.required && !parsed.headers.map((h) => h.trim()).includes(c.header.trim()),
      );
      if (missing.length) {
        setErr(`缺少必填列：${missing.map((m) => m.header).join('、')}`);
        return;
      }
      const [classes, users] = await Promise.all([db.classes.list(), db.users.list()]);
      const planRows = validateImportRows(parsed, buildClassMap(classes), collectAccounts(users));
      setPlan(planRows);
      setStep('preview');
    } catch (e) {
      setErr(e instanceof Error ? e.message : '文件读取失败');
    }
  };

  const confirmImport = async () => {
    setSaving(true);
    setErr('');
    try {
      const res = await runBatchImport(db, actor, plan);
      setResult(res);
      setStep('done');
      if (res.created > 0) onSaved?.();
    } catch (e) {
      setErr(e instanceof Error ? e.message : '导入失败');
    } finally {
      setSaving(false);
    }
  };

  const footer = (
    <>
      <Button variant="ghost" onClick={onClose} disabled={saving}>
        关闭
      </Button>
      {step === 'preview' && (
        <Button variant="primary" onClick={confirmImport} disabled={saving || validRows().length === 0}>
          {saving ? '导入中…' : `确认导入（${validRows().length} 条）`}
        </Button>
      )}
    </>
  );

  return (
    <Modal open={open} title="批量导入学员" onClose={onClose} width={720} footer={footer}>
      {step === 'upload' && (
        <div className="stack">
          <p className="muted" style={{ marginTop: 0 }}>
            一次录入多名学员，告别逐条手填。支持 <b>CSV</b> 格式（可用 Excel 编辑后「另存为 CSV（UTF-8）」）。
            导入复用与「新增学员」完全相同的校验与写入逻辑，账号重复、班级不存在等会被自动拦截。
          </p>

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <Button variant="primary" onClick={downloadTemplate}>
              下载导入模板
            </Button>
            <label className="btn-import-file">
              <input
                type="file"
                accept=".csv,text/csv"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleFile(f);
                  e.target.value = '';
                }}
              />
              <span>选择 CSV 文件…</span>
            </label>
          </div>
          {fileName && <div className="muted">已选择：{fileName}</div>}

          <div className="import-cols">
            <div className="sub-label">模板列说明（带 * 为必填）</div>
            <div className="import-cols-grid">
              {IMPORT_COLUMNS.map((c) => (
                <div key={c.key} className="import-col">
                  <span className={c.required ? 'req' : ''}>{c.header}</span>
                  {c.required && <span className="req-star"> *</span>}
                  {c.hint && <span className="muted"> · {c.hint}</span>}
                </div>
              ))}
            </div>
          </div>

          {classNames.length > 0 && (
            <div className="muted" style={{ fontSize: 'var(--fs-secondary)' }}>
              系统现有班级：{classNames.join('、')}（CSV 中「班级」列需与之一致）
            </div>
          )}

          {err && <div className="form-error" style={{ marginTop: 8 }}>{err}</div>}
        </div>
      )}

      {step === 'preview' && (
        <div className="stack">
          <div className="import-summary">
            <span className="tag-ok">可导入 {validRows().length} 条</span>
            <span className={invalidRows().length ? 'tag-bad' : 'tag-ok'}>待修正 {invalidRows().length} 条</span>
          </div>
          {fileName && <div className="muted">文件：{fileName}</div>}
          <div className="import-preview-wrap">
            <table className="stable import-preview">
              <thead>
                <tr>
                  <th>行</th>
                  <th>展示姓名</th>
                  <th>登录账号</th>
                  <th>班级</th>
                  <th>状态</th>
                </tr>
              </thead>
              <tbody>
                {plan.slice(0, 60).map((p) => (
                  <tr key={p.lineNo}>
                    <td className="muted">{p.lineNo}</td>
                    <td>{p.nickname || '—'}</td>
                    <td className="muted">{p.input?.account ?? '—'}</td>
                    <td className="muted">{p.input?.classId ? '✓' : '—'}</td>
                    <td>
                      {p.input ? (
                        <span className="tag-ok">可导入</span>
                      ) : (
                        <span className="tag-bad" title={p.errors.join('；')}>
                          {p.errors[0] ?? '错误'}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {plan.length > 60 && <div className="muted">仅显示前 60 行，共计 {plan.length} 行</div>}
          {err && <div className="form-error" style={{ marginTop: 8 }}>{err}</div>}
        </div>
      )}

      {step === 'done' && result && (
        <div className="stack">
          <div className="import-summary">
            <span className="tag-ok">成功导入 {result.created} 条</span>
            <span className={result.failed.length ? 'tag-bad' : 'tag-ok'}>
              失败 {result.failed.length} 条
            </span>
          </div>
          {result.failed.length > 0 && (
            <div className="import-preview-wrap">
              <table className="stable import-preview">
                <thead>
                  <tr>
                    <th>行</th>
                    <th>展示姓名</th>
                    <th>失败原因</th>
                  </tr>
                </thead>
                <tbody>
                  {result.failed.map((f) => (
                    <tr key={f.lineNo}>
                      <td className="muted">{f.lineNo}</td>
                      <td>{f.nickname}</td>
                      <td className="muted">{f.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="muted" style={{ marginTop: 0 }}>
            导入成功的学员已出现在列表中；可在「学员档案」继续编辑其详细资料。
          </p>
        </div>
      )}
    </Modal>
  );
}
