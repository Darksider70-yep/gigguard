module.exports = {
  roots: ['<rootDir>/tests', '<rootDir>/backend/tests'],
  testMatch: ['**/__tests__/**/*.ts', '**/?(*.)+(spec|test).ts'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: {
        target: 'ES2020',
        module: 'commonjs',
        lib: ['ES2020'],
        types: ['jest', 'node'],
      },
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
  testEnvironment: 'node',
  testTimeout: 30000,
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
};
