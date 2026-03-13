/** @type {import('jest').Config} */
const config = {
  preset: 'jest-expo',
  testMatch: ['**/__tests__/**/*.test.{ts,tsx}'],
  transformIgnorePatterns: [
    '/node_modules/(?!(.pnpm|react-native|@react-native|@react-native-community|expo|@expo|@expo-google-fonts|react-navigation|@react-navigation|@sentry/react-native|native-base|@testing-library))',
  ],
  collectCoverage: false,
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  coverageThreshold: {
    global: {
      lines: 85,
      functions: 85,
      branches: 85,
      statements: 85,
    },
  },
  coveragePathIgnorePatterns: [
    '/node_modules/',
    '/coverage/',
    'index.js',
    'babel.config.js',
    'jest.config.js',
    // API client uses fetch and is covered by integration/e2e tests, not unit coverage
    'src/lib/api/client',
    // React components/hooks require DOM rendering — covered by e2e/integration tests
    'src/components',
  ],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '@react-native-async-storage/async-storage': require.resolve(
      '@react-native-async-storage/async-storage/jest/async-storage-mock'
    ),
    // Prevent expo winter runtime from loading during Jest setup.
    // jest-expo's setup.js does require('expo/src/winter') which installs a lazy
    // global getter for __ExpoImportMetaRegistry. When that getter fires, it tries
    // to require './ImportMetaRegistry' outside of test scope, causing jest-runtime
    // to throw. Mocking the entire winter module prevents the getter from being installed.
    '^expo/src/winter$': '<rootDir>/src/test/__mocks__/expo-winter.js',
  },
};

module.exports = config;
