import expoConfig from 'eslint-config-expo/flat.js';
import prettierConfig from 'eslint-config-prettier';
import prettierPlugin from 'eslint-plugin-prettier';

/** @type {import("eslint").Linter.Config[]} */
export default [
  ...expoConfig,
  prettierConfig,
  {
    plugins: {
      prettier: prettierPlugin,
    },
    rules: {
      'prettier/prettier': 'warn',
      'import/no-unresolved': 'off',
      'import/namespace': 'off',
      'import/no-duplicates': 'off',
    },
  },
  {
    ignores: ['**/dist/', 'node_modules/', '.expo/', 'ios/', 'android/'],
  },
];
