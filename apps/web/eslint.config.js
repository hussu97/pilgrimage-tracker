import js from '@eslint/js';
import tsEslint from 'typescript-eslint';
import reactPlugin from 'eslint-plugin-react';
import reactHooksPlugin from 'eslint-plugin-react-hooks';
import reactRefreshPlugin from 'eslint-plugin-react-refresh';
import prettierConfig from 'eslint-config-prettier';

export default tsEslint.config(
  // Base JS rules
  js.configs.recommended,

  // TypeScript rules
  ...tsEslint.configs.recommended,

  // React rules
  {
    plugins: {
      react: reactPlugin,
      'react-hooks': reactHooksPlugin,
      'react-refresh': reactRefreshPlugin,
    },
    settings: {
      react: { version: 'detect' },
    },
    rules: {
      // React
      'react/react-in-jsx-scope': 'off', // React 17+ JSX transform
      'react/prop-types': 'off',         // TypeScript handles this
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],

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

  // Ignore built output and config files
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**', 'postcss.config.js', 'tailwind.config.js'],
  },
);
