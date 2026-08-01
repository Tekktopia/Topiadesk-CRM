// Shared flat ESLint config, consumed by every workspace package via
// `import rootConfig from '../../eslint.config.mjs'` (or a package-local
// eslint.config.mjs that re-exports this with app-specific overrides, e.g.
// apps/web's Next.js plugin rules).
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: ['**/dist/**', '**/.next/**', '**/node_modules/**', '**/generated/**', '**/coverage/**'],
  },
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
      // CAUTION (apps/api specifically): running `eslint --fix` will happily
      // rewrite `import { SomeDto }` to `import type { SomeDto }` wherever
      // it's structurally type-only-eligible — including a DTO class used
      // as a @Body()/@Param()/@Query() parameter type. That erases the
      // class at compile time, which silently disables class-validator
      // validation for that endpoint (NestJS's ValidationPipe relies on
      // `emitDecoratorMetadata`'s design:paramtypes, which needs a real
      // value import). Caught and fixed once already during this project's
      // Phase 0 — after running --fix in apps/api, grep for `@Body()`,
      // `@Param(`, `@Query(` and manually verify their DTO's import is NOT
      // `import type`.
      '@typescript-eslint/consistent-type-imports': 'warn',
    },
  },
);
