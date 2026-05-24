import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import prettierConfig from 'eslint-config-prettier'

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettierConfig,
  {
    files: ['**/*.ts'],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.json'],
      },
      globals: {
        window: 'readonly',
        document: 'readonly',
        console: 'readonly',
        process: 'readonly',
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
  {
    files: ['tests/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      'no-restricted-globals': 'off',
    },
  },
  {
    ignores: ['main.js', 'main.js.map', 'node_modules/**', 'coverage/**', 'dist/**'],
  },
)
