module.exports = {
  root: true,
  env: { browser: true, es2022: true, node: true },
  parserOptions: { ecmaVersion: 'latest', sourceType: 'module', ecmaFeatures: { jsx: true } },
  plugins: ['react', 'react-hooks'],
  settings: { react: { version: 'detect' } },
  rules: {
    'no-dupe-keys': 'error',
    'no-unreachable': 'error',
    'no-undef': 'error',
    'react/jsx-no-duplicate-props': 'error',
    'react-hooks/rules-of-hooks': 'error',
  },
};
