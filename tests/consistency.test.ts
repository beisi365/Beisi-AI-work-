import { describe, it, expect, beforeEach } from 'vitest';
import { LocalDataLayer } from '../src/data/repository/LocalDataLayer';
import { runConsistencyCheck } from '../src/data/consistency';

describe('一致性检查', () => {
  let db: LocalDataLayer;
  beforeEach(async () => {
    db = new LocalDataLayer();
    await db.reset();
  });

  it('种子数据通过全部一致性校验', async () => {
    const report = await runConsistencyCheck(db);
    if (!report.allPassed) {
      // 输出失败项，便于定位
      report.checks.filter((c) => !c.passed).forEach((c) => console.log('FAIL:', c.name, c.detail));
    }
    expect(report.allPassed).toBe(true);
  });
});
