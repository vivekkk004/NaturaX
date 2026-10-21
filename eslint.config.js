import js from '@eslint/js';
import globals from 'globals';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import prettier from 'eslint-config-prettier';

/**
 * One flat config for the whole monorepo: Node rules for server/, browser + React rules for client/.
 * Prettier owns formatting; ESLint only reports real code problems (eslint-config-prettier
 * switches off every stylistic rule that would fight Prettier).
 */
export default [
  { ignores: ['**/node_modules/**', '**/dist/**', '**/coverage/**', 'server/uploads/**'] },

  js.configs.recommended,

  {
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'prefer-const': 'error',
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-console': 'warn',
    },
  },

  {
    files: ['server/**/*.js', '*.config.js'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module', globals: globals.node },
  },

  {
    files: ['client/**/*.{js,jsx}'],
    ignores: ['client/vite.config.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    settings: { react: { version: 'detect' } },
    plugins: { react, 'react-hooks': reactHooks },
    rules: {
      ...react.configs.flat.recommended.rules,
      ...react.configs.flat['jsx-runtime'].rules,
      ...reactHooks.configs.flat.recommended.rules,
      'react/prop-types': 'off', // plain JS project; props are documented with JSDoc instead
    },
  },
  {
    files: ['client/src/**/*.jsx'],
    ...reactRefresh.configs.vite,
  },
  {
    files: ['client/vite.config.js'],
    languageOptions: { sourceType: 'module', globals: globals.node },
  },

  // Scripts and env loading legitimately print to the terminal.
  { files: ['server/scripts/**/*.js', 'server/src/config/env.js'], rules: { 'no-console': 'off' } },

  prettier,
];
