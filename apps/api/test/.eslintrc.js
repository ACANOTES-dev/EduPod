module.exports = {
  extends: [require.resolve('@school/eslint-config/nest')],
  parserOptions: {
    project: './tsconfig.json',
    tsconfigRootDir: __dirname,
  },
  root: true,
};
