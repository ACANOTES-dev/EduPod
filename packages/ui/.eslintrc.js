module.exports = {
  extends: [require.resolve('@school/eslint-config/next')],
  parserOptions: {
    project: './tsconfig.json',
    tsconfigRootDir: __dirname,
  },
  root: true,
};
