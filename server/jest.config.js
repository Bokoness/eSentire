/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  // Points Prisma at the separate test database before any test module loads.
  setupFiles: ['<rootDir>/tests/setup-env.ts'],
};
