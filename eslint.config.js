export default [
  {
    files: ['**/*.{js,mjs,cjs,ts}'],
    ignores: ['dist/**', 'node_modules/**', 'userbot-session/**', 'data/**'],
    rules: {
      // Basic rules
      'no-console': 'off',
      'no-unused-vars': 'off',
      'prefer-const': 'error',
      'no-var': 'error',
      eqeqeq: ['error', 'always'],
      curly: ['error', 'all'],
      semi: ['error', 'always'],
      quotes: ['error', 'single', { avoidEscape: true }],
    },
  },
];
