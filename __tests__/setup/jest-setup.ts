// Common Jest setup and mocks for all tests
jest.mock('../../src/config/env-config', () => ({
  BOT_ADMIN_ID: 0,
  BOT_TOKEN: 't',
  LOG_FILE: '/tmp/test.log',
}));
