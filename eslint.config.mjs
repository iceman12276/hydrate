import js from '@eslint/js'
import tseslint from 'typescript-eslint'

// Flat config shared by every package (each package re-exports this).
// Kept syntactic-only (no type-checked rules) so it runs fast without a
// per-package tsconfig project service. The a11y gate lands in M9.
export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/.next/**',
      '**/out/**',
      '**/dist/**',
      '**/.turbo/**',
      '**/.expo/**',
      '**/src-tauri/target/**',
      '**/coverage/**',
      '**/*.config.*',
      '**/next-env.d.ts',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  },
)
