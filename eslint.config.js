import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import globals from 'globals';

/**
 * Determinism rules for the simulation engine and shared contracts.
 * Wall-clock time and unseeded randomness are banned so that replaying the same
 * commands from the same snapshot always produces identical results.
 */
const determinismRules = {
  'no-restricted-properties': [
    'error',
    { object: 'Math', property: 'random', message: 'Use the seeded RNG (engine/core/rng).' },
    { object: 'Date', property: 'now', message: 'Simulation time comes from the world clock.' },
    { object: 'performance', property: 'now', message: 'No wall-clock time in the engine.' },
    { object: 'crypto', property: 'randomUUID', message: 'Use deterministic engine IDs.' },
  ],
  'no-restricted-syntax': [
    'error',
    {
      selector: "NewExpression[callee.name='Date']",
      message: 'No wall-clock dates in the engine; use the world clock.',
    },
    {
      selector: "CallExpression[callee.name='Date']",
      message: 'No wall-clock dates in the engine; use the world clock.',
    },
  ],
  'no-restricted-globals': [
    'error',
    'window',
    'document',
    'navigator',
    'localStorage',
    'sessionStorage',
    'indexedDB',
    'setTimeout',
    'setInterval',
    'fetch',
  ],
};

export default defineConfig([
  globalIgnores([
    'dist',
    'dev-dist',
    'coverage',
    'playwright-report',
    'test-results',
    'node_modules',
    '.dependency-cruiser.cjs',
  ]),
  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        project: [
          './tsconfig.contracts.json',
          './tsconfig.engine.json',
          './tsconfig.worker.json',
          './tsconfig.app.json',
          './tsconfig.node.json',
        ],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      eqeqeq: ['error', 'always'],
      'no-console': ['error', { allow: ['warn', 'error'] }],
    },
  },
  {
    files: ['src/app/**/*.{ts,tsx}'],
    extends: [reactHooks.configs.flat['recommended-latest'], jsxA11y.flatConfigs.strict],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ['src/worker/**/*.ts', 'src/persistence/**/*.ts'],
    languageOptions: { globals: globals.worker },
  },
  {
    files: ['src/engine/**/*.ts', 'src/contracts/**/*.ts'],
    rules: determinismRules,
  },
  {
    files: ['*.config.{ts,js}', 'aliases.ts', 'tests/**/*.ts'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['**/*.js', '**/*.cjs'],
    extends: [tseslint.configs.disableTypeChecked],
  },
]);
