module.exports = {
  roots: ['<rootDir>/tests'],
  testMatch: ['**/e2e/**/*.test.ts'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: '<rootDir>/backend/tsconfig.json',
      diagnostics: false,
    }],
  },
  testEnvironment: 'node',
  testTimeout: 60000,
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  globalSetup: '<rootDir>/tests/setup/integration.js',
  globalTeardown: '<rootDir>/tests/setup/teardown.js',
};
