import { describe, it, expect, beforeEach } from 'vitest';
import { LocalDataLayer } from '../src/data/repository/LocalDataLayer';

describe('LocalDataLayer 仓储与事务', () => {
  let db: LocalDataLayer;
  beforeEach(async () => {
    db = new LocalDataLayer();
    await db.reset();
  });

  it('list / get / insert / update / remove', async () => {
    const created = await db.todos.insert({
      owner_type: 'system',
      owner_id: 'sys',
      title: 't',
      related_student_id: null,
      due: null,
      status: 'todo',
      created_by: 'u_t1',
    });
    expect(created.id).toBeTruthy();
    const got = await db.todos.get(created.id);
    expect(got?.title).toBe('t');
    const updated = await db.todos.update(created.id, { status: 'done' });
    expect(updated.status).toBe('done');
    await db.todos.remove(created.id);
    expect(await db.todos.get(created.id)).toBeNull();
  });

  it('insert 自动维护时间戳并落操作日志', async () => {
    const before = (await db.getOperationLogs()).length;
    await db.todos.insert({
      owner_type: 'system',
      owner_id: 'sys',
      title: 'x',
      related_student_id: null,
      due: null,
      status: 'todo',
      created_by: 'u_t1',
    });
    const after = await db.getOperationLogs();
    expect(after.length).toBe(before + 1);
    const last = after[after.length - 1];
    expect(last.action).toBe('insert');
  });

  it('事务在出错时整体回滚', async () => {
    const snap = (await db.todos.list()).length;
    await expect(
      db.transaction(async (tx) => {
        await tx.todos.insert({ owner_type: 'system', owner_id: 'sys', title: 'a', related_student_id: null, due: null, status: 'todo', created_by: 'u_t1' });
        await tx.todos.insert({ owner_type: 'system', owner_id: 'sys', title: 'b', related_student_id: null, due: null, status: 'todo', created_by: 'u_t1' });
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect((await db.todos.list()).length).toBe(snap);
  });

  it('事务成功时提交', async () => {
    const snap = (await db.todos.list()).length;
    await db.transaction(async (tx) => {
      await tx.todos.insert({ owner_type: 'system', owner_id: 'sys', title: 'a', related_student_id: null, due: null, status: 'todo', created_by: 'u_t1' });
    });
    expect((await db.todos.list()).length).toBe(snap + 1);
  });

  it('reset 恢复到种子数据', async () => {
    await db.todos.insert({ owner_type: 'system', owner_id: 'sys', title: 'z', related_student_id: null, due: null, status: 'todo', created_by: 'u_t1' });
    await db.reset();
    expect((await db.students.list()).length).toBe(125);
  });
});
