// Loaded before every test module, before any connection can be opened.
const url = new URL(process.env.DATABASE_URL || 'mysql://invalid/');
if (process.env.NODE_ENV !== 'test' || url.hostname !== 'integration-db' ||
    url.pathname !== '/carelia' || url.username !== 'carelia' || url.password !== 'carelia_test') {
  throw new Error('Tests refusés : utiliser uniquement le MySQL isolé de compose.integration.yaml.');
}
