import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  // next-safe-action and unpdf (PDF text, bonus B4) ship ESM; ts-jest transpiles them so the real code runs in tests.
  moduleFileExtensions: ['ts', 'tsx', 'js', 'mjs', 'cjs', 'json'],
  transform: {
    '^.+\\.tsx?$': 'ts-jest',
    // unpdf's PDF.js bundle reads import.meta.url, which CommonJS has no equivalent for.
    'unpdf/dist/pdfjs\\.mjs$': '<rootDir>/__tests__/setup/import-meta-url-transformer.cjs',
    '^.+\\.[mc]?js$': ['ts-jest', { tsconfig: { allowJs: true } }],
  },
  transformIgnorePatterns: ['/node_modules/(?!(next-safe-action|unpdf)/)'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
    // Export only under the "import" condition; unpdf loads it with import(), transpiled to require() here.
    '^unpdf/pdfjs$': '<rootDir>/node_modules/unpdf/dist/pdfjs.mjs',
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
