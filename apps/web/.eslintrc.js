module.exports = {
  extends: [require.resolve('@school/eslint-config/next'), 'next/core-web-vitals'],
  parserOptions: {
    project: './tsconfig.json',
    tsconfigRootDir: __dirname,
  },
  root: true,
};
