const js = require('@eslint/js');
const globals = require('globals');

const rules = {
  'no-multi-spaces': ['error', { ignoreEOLComments: true }],
  semi: ['error', 'always'],
  'semi-spacing': ['error', { after: true, before: false }],
  'semi-style': ['error', 'last'],
  'no-extra-semi': 'error',
  'comma-dangle': ['error', 'always-multiline'],
  'no-unused-vars': ['error', { args: 'none' }],
};

module.exports = [
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'src/renderer/js/mousetrap.js',
    ],
  },
  js.configs.recommended,
  {
    files: ['eslint.config.js', 'src/main.js', 'src/preload*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'commonjs',
      globals: globals.node,
    },
    rules,
  },
  {
    files: ['src/renderer/js/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'script',
      globals: {
        ...globals.browser,
        // Read-only API exposed to the renderer via contextBridge in preload.js.
        webUtils: 'readonly',
      },
    },
    rules,
  },
];
