import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  testMatch: ['**/__tests__/**/*.test.ts'],
  collectCoverageFrom: ['lib/**/*.ts', 'app/api/**/*.ts', '!lib/prisma.ts', '!**/*.d.ts'],
  coverageThreshold: {
    global: { branches: 90, functions: 90, lines: 90, statements: 90 },
  },
};

export default config;
