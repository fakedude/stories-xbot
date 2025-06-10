module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  setupFilesAfterEnv: ['./__tests__/setup/jest-setup.ts'],
  // ...other existing config options
};
