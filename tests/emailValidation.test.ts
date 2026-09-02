import { describe, it, expect } from 'vitest';
import { checkEmail, isBlocked } from '../src/lib/emailValidation';

describe('checkEmail', () => {
  it('接受正常邮箱并规范化（trim + 小写）', () => {
    const r = checkEmail('  AbC@QQ.COM  ');
    expect(r.valid).toBe(true);
    expect(r.value).toBe('abc@qq.com');
  });

  it('空邮箱返回错误', () => {
    const r = checkEmail('   ');
    expect(r.valid).toBe(false);
    expect(r.error).toBeTruthy();
  });

  it('无 @ 或域名不合法返回格式错误', () => {
    expect(checkEmail('qq.com').valid).toBe(false);
    expect(checkEmail('a@b').valid).toBe(false);
    expect(checkEmail('a@b@c.com').valid).toBe(false);
  });

  it('整域名笔误（qq.coml）被拦截并给出修正建议', () => {
    const r = checkEmail('user@qq.coml');
    expect(r.valid).toBe(false);
    expect(r.suggestion).toBe('user@qq.com');
    expect(r.warning).toBeTruthy();
  });

  it('后缀笔误（.con）被拦截并修正为 .com', () => {
    const r = checkEmail('user@gmail.con');
    expect(r.valid).toBe(false);
    expect(r.suggestion).toBe('user@gmail.com');
  });

  it('主流正常域名通过', () => {
    for (const e of ['a@qq.com', 'a@163.com', 'a@gmail.com', 'a@foxmail.com', 'a@outlook.com']) {
      expect(checkEmail(e).valid, e).toBe(true);
    }
  });

  it('不误伤正常但少见的真实后缀', () => {
    for (const e of ['a@x.cn', 'a@x.net', 'a@x.org', 'a@x.io']) {
      expect(checkEmail(e).valid, e).toBe(true);
    }
  });
});

describe('isBlocked', () => {
  it('合法邮箱不拦截', () => {
    expect(isBlocked(checkEmail('a@qq.com'))).toBe(false);
  });
  it('笔误邮箱拦截', () => {
    expect(isBlocked(checkEmail('a@qq.coml'))).toBe(true);
  });
});
