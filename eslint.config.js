import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/', 'data/', 'node_modules/', '.wrangler/', 'products/mini-ww/generated/'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      eqeqeq: 'error',
      'no-eval': 'error',
      'no-implied-eval': 'error',
    },
  },
);
