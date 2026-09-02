/**
 * 邮箱规范校验工具
 * 目标：拦截注册/登录时的笔误邮箱（如 `qq.coml`、`qq.con`），避免创建出
 * 无法对应真实花名册的「野号」，从而导致管理员/教师权限错乱。
 */

export interface EmailCheck {
  /** 已 trim + 转小写的规范值，可直接用于提交 */
  value: string;
  /** 是否通过校验（格式正确且无高置信度笔误） */
  valid: boolean;
  /** 硬错误：格式都不合法，必须拦截 */
  error?: string;
  /** 软警告：高置信度笔误，给出修正建议，同样拦截提交 */
  warning?: string;
  /** 建议修正后的邮箱（命中笔误时返回） */
  suggestion?: string;
}

/**
 * 整域名级别的常见笔误（含主流邮箱服务商的常见拼错）。
 * 命中即视为笔误，直接给出修正建议。
 */
const COMMON_DOMAIN_TYPOS: Record<string, string> = {
  'qq.con': 'qq.com',
  'qq.coml': 'qq.com',
  'qq.cpm': 'qq.com',
  'qq.cmo': 'qq.com',
  'gmail.con': 'gmail.com',
  'gmail.coml': 'gmail.com',
  '163.con': '163.com',
  '163.coml': '163.com',
  '126.con': '126.com',
  'outlook.con': 'outlook.com',
  'hotmail.con': 'hotmail.com',
  'foxmail.con': 'foxmail.com',
  'foxmail.coml': 'foxmail.com',
};

/**
 * 后缀（TLD）级别的常见笔误。仅收录「不可能是真实域名」的拼写，
 * 避免误伤正常邮箱（如真实 TLD：com/cn/net/org/io/edu 等均不在此列）。
 */
const TLD_TYPOS: Record<string, string> = {
  con: 'com',
  coml: 'com',
  cpm: 'com',
  cmo: 'com',
  comm: 'com',
  conm: 'com',
};

const FORMAT_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * 校验邮箱：先 trim + 转小写，再依次检查格式与笔误。
 * 返回规范化值、是否通过、以及（可选）错误/警告/修正建议。
 */
export function checkEmail(raw: string): EmailCheck {
  const value = (raw ?? '').trim().toLowerCase();
  if (!value) {
    return { value, valid: false, error: '请输入邮箱' };
  }

  if (!FORMAT_RE.test(value)) {
    return {
      value,
      valid: false,
      error: '邮箱格式不正确，请检查是否包含「@」和域名（例如 name@qq.com）',
    };
  }

  const [local, domain] = value.split('@');

  // 整域名笔误
  if (COMMON_DOMAIN_TYPOS[domain]) {
    const suggestion = `${local}@${COMMON_DOMAIN_TYPOS[domain]}`;
    return {
      value,
      valid: false,
      warning: `邮箱域名疑似拼写错误：「${domain}」建议改为「${COMMON_DOMAIN_TYPOS[domain]}」`,
      suggestion,
    };
  }

  // 后缀笔误
  const tld = domain.split('.').pop() as string;
  if (TLD_TYPOS[tld]) {
    const fixedDomain = domain.replace(new RegExp(`${tld}$`), TLD_TYPOS[tld]);
    const suggestion = `${local}@${fixedDomain}`;
    return {
      value,
      valid: false,
      warning: `邮箱后缀疑似拼写错误：「.${tld}」建议改为「.${TLD_TYPOS[tld]}」`,
      suggestion,
    };
  }

  return { value, valid: true };
}

/** 判断校验结果是否应拦截提交：格式错误或高置信度笔误都拦截 */
export function isBlocked(check: EmailCheck): boolean {
  return !check.valid;
}
