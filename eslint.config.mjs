import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import prettierConfig from 'eslint-config-prettier'
import globals from 'globals'

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettierConfig,
  // TypeScript source files — full project-aware linting
  {
    files: ['src/**/*.ts', 'tests/**/*.ts'],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.json'],
      },
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
      'no-restricted-globals': [
        'error',
        { name: 'confirm', message: 'Use ConfirmModalPort.' },
        { name: 'alert', message: 'Use NotificationPort.' },
        { name: 'prompt', message: 'Use ConfirmModalPort.' },
      ],
      'no-restricted-properties': [
        'error',
        { property: 'innerHTML', message: 'XSS risk. Use createEl/setText.' },
        { property: 'outerHTML', message: 'XSS risk. Use createEl/setText.' },
        { property: 'insertAdjacentHTML', message: 'XSS risk. Use createEl/setText.' },
      ],
    },
  },
  // Promote no-explicit-any to error for src (excluding tests and plugin/infra entry points)
  {
    files: ['src/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  // Domain and application layers must not import obsidian — use a port
  {
    files: ['src/domain/**/*.ts', 'src/application/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['obsidian'],
              message: 'Domain/application must not import obsidian directly. Use a port.',
            },
          ],
        },
      ],
    },
  },
  // Config/script files at root — node globals, no project linting
  {
    files: ['*.ts', '*.mjs', 'scripts/**/*.js'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
  {
    files: ['tests/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      // no-restricted-globals intentionally kept at 'error' for tests —
      // tests must not call confirm/alert/prompt either.
    },
  },
  {
    ignores: ['main.js', 'main.js.map', 'node_modules/**', 'coverage/**', 'dist/**'],
  },
)
