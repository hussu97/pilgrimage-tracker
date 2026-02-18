import js from '@eslint/js';
import tsEslint from 'typescript-eslint';
import reactPlugin from 'eslint-plugin-react';
import reactHooksPlugin from 'eslint-plugin-react-hooks';
import prettierConfig from 'eslint-config-prettier';

export default tsEslint.config(
  // Base JS rules
  js.configs.recommended,

  // TypeScript rules
  ...tsEslint.configs.recommended,

  // React / React Native rules
  {
    plugins: {
      react: reactPlugin,
      'react-hooks': reactHooksPlugin,
    },
    settings: {
      react: { version: 'detect' },
    },
    rules: {
      // React
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',

      // TypeScript
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/consistent-type-imports': ['warn', { prefer: 'type-imports' }],

      // General
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'no-empty': ['warn', { allowEmptyCatch: true }],
    },
  },

  // Disable formatting rules handled by Prettier
  prettierConfig,

  // Ignore built output, config files, and test mocks (CommonJS)
  {
    ignores: ['node_modules/**', 'coverage/**', 'babel.config.js', 'metro.config.js', '.expo/**', 'src/test/__mocks__/**'],
  },
);
