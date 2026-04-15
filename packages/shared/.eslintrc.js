module.exports = {
  extends: [require.resolve('@school/eslint-config')],
  parserOptions: {
    project: './tsconfig.eslint.json',
    tsconfigRootDir: __dirname,
  },
  root: true,
};
