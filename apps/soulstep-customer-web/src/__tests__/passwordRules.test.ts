import { describe, it, expect } from 'vitest';
import { checkRule, ruleTranslationKey } from '@/lib/utils/passwordRules';
import type { PasswordRule } from '@/lib/api/client';

describe('checkRule', () => {
  describe('min_length', () => {
    const rule: PasswordRule = { type: 'min_length', value: 8 };

    it('passes when password meets minimum length', () => {
      expect(checkRule(rule, 'Abcdef1!')).toBe(true);
      expect(checkRule(rule, 'a'.repeat(8))).toBe(true);
    });

    it('fails when password is shorter than minimum length', () => {
      expect(checkRule(rule, 'Abc123')).toBe(false);
      expect(checkRule(rule, '')).toBe(false);
    });

    it('uses default value of 8 when value is not provided', () => {
      const ruleNoValue: PasswordRule = { type: 'min_length' };
      expect(checkRule(ruleNoValue, 'a'.repeat(8))).toBe(true);
      expect(checkRule(ruleNoValue, 'a'.repeat(7))).toBe(false);
    });
  });

  describe('require_uppercase', () => {
    const rule: PasswordRule = { type: 'require_uppercase' };

    it('passes when password contains an uppercase letter', () => {
      expect(checkRule(rule, 'Password1')).toBe(true);
      expect(checkRule(rule, 'A')).toBe(true);
    });

    it('fails when password has no uppercase letter', () => {
      expect(checkRule(rule, 'password1')).toBe(false);
      expect(checkRule(rule, '')).toBe(false);
    });
  });

  describe('require_lowercase', () => {
    const rule: PasswordRule = { type: 'require_lowercase' };

    it('passes when password contains a lowercase letter', () => {
      expect(checkRule(rule, 'PASSWORD1a')).toBe(true);
      expect(checkRule(rule, 'a')).toBe(true);
    });

    it('fails when password has no lowercase letter', () => {
      expect(checkRule(rule, 'PASSWORD1')).toBe(false);
      expect(checkRule(rule, '')).toBe(false);
    });
  });

  describe('require_digit', () => {
    const rule: PasswordRule = { type: 'require_digit' };

    it('passes when password contains a digit', () => {
      expect(checkRule(rule, 'Password1')).toBe(true);
      expect(checkRule(rule, '1')).toBe(true);
    });

    it('fails when password has no digit', () => {
      expect(checkRule(rule, 'Password')).toBe(false);
      expect(checkRule(rule, '')).toBe(false);
    });
  });

  describe('unknown rule type', () => {
    it('returns true for unknown types (permissive default)', () => {
      const rule = { type: 'unknown_rule' } as unknown as PasswordRule;
      expect(checkRule(rule, '')).toBe(true);
      expect(checkRule(rule, 'anything')).toBe(true);
    });
  });
});

describe('ruleTranslationKey', () => {
  it('returns correct keys for known rule types', () => {
    expect(ruleTranslationKey({ type: 'min_length', value: 8 })).toBe('auth.passwordRuleMinLength');
    expect(ruleTranslationKey({ type: 'require_uppercase' })).toBe('auth.passwordRuleUppercase');
    expect(ruleTranslationKey({ type: 'require_lowercase' })).toBe('auth.passwordRuleLowercase');
    expect(ruleTranslationKey({ type: 'require_digit' })).toBe('auth.passwordRuleDigit');
  });

  it('returns empty string for unknown types', () => {
    const rule = { type: 'unknown' } as unknown as PasswordRule;
    expect(ruleTranslationKey(rule)).toBe('');
  });
});
