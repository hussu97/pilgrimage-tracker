import type { PasswordRule } from '@/lib/api/client';

export function checkRule(rule: PasswordRule, password: string): boolean {
  switch (rule.type) {
    case 'min_length':
      return password.length >= (rule.value ?? 8);
    case 'require_uppercase':
      return /[A-Z]/.test(password);
    case 'require_lowercase':
      return /[a-z]/.test(password);
    case 'require_digit':
      return /\d/.test(password);
    default:
      return true;
  }
}

export function ruleTranslationKey(rule: PasswordRule): string {
  switch (rule.type) {
    case 'min_length':
      return 'auth.passwordRuleMinLength';
    case 'require_uppercase':
      return 'auth.passwordRuleUppercase';
    case 'require_lowercase':
      return 'auth.passwordRuleLowercase';
    case 'require_digit':
      return 'auth.passwordRuleDigit';
    default:
      return '';
  }
}
