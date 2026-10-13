import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  // next-safe-action ships ESM only (.mjs); let ts-jest transpile it so the real server actions run in tests.
  moduleFileExtensions: ['ts', 'tsx', 'js', 'mjs', 'json'],
  transform: {
    '^.+\\.tsx?$': 'ts-jest',
    '^.+\\.m?js$': ['ts-jest', { tsconfig: { allowJs: true } }],
  },
  transformIgnorePatterns: ['/node_modules/(?!next-safe-action/)'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  testMatch: ['**/__tests__/**/*.test.ts'],
  globalSetup: '<rootDir>/__tests__/setup/global-setup.ts',
  globalTeardown: '<rootDir>/__tests__/setup/global-teardown.ts',
  setupFiles: ['<rootDir>/__tests__/setup/isolated-database.ts'],
  collectCoverageFrom: ['lib/**/*.ts', 'app/api/**/*.ts', '!lib/prisma.ts', '!**/*.d.ts'],
  coverageThreshold: {
    global: { branches: 90, functions: 90, lines: 90, statements: 90 },
  },
};

export default config;
