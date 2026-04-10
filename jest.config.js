module.exports = {
  roots: ['<rootDir>/backend/src'],
  testMatch: ['**/__tests__/**/*.ts', '**/?(*.)+(spec|test).ts'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: '<rootDir>/backend/tsconfig.json',
    }],
  },
  collectCoverageFrom: [
    'backend/src/**/*.ts',
    '!backend/src/**/*.d.ts',
    '!backend/src/index.ts',
  ],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/backend/src/$1',
  },
  testPathIgnorePatterns: [
    '/node_modules/',
    '/backend/dist/',
    '/backend/src/__tests__/integration/',
    '/backend/tests/integration/',
    '/tests/e2e/full-claim-flow.test.ts',
    '/tests/integration/fraud-scorer.test.ts',
    '/tests/integration/trigger-monitor.test.ts',
  ],
  testEnvironment: 'node',
  testTimeout: 30000,
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
};
