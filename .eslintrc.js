module.exports = {
  env: {
    browser: true,
    commonjs: true,
    es2021: true,
    node: true,
  },
  extends: 'eslint:recommended',
  overrides: [
    {
      env: {
        node: true,
      },
      files: [
        '.eslintrc.{js,cjs}',
      ],
      parserOptions: {
        sourceType: 'script',
      }
    }
  ],
  parserOptions: {
    ecmaVersion: 'latest',
  },
  rules: {
    "no-multi-spaces": ["error", {"ignoreEOLComments": true}],
    "semi": ["error", "always"],
    "semi-spacing": ["error", {"after": true, "before": false}],
    "semi-style": ["error", "last"],
    "no-extra-semi": "error",
    "comma-dangle": ["error", "always-multiline"],
    "no-unused-vars": ["error", {"args": "none"}],
  },
}
