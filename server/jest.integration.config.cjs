// Config Jest de la suite d'intégration (distincte du `npm test` unitaire, qui n'a
// pas besoin de base de données). Lancer avec `npm run test:integration` — nécessite
// la stack Docker (`docker compose up -d db`).
//
// Pas de transform babel : les tests et l'app sont chargés en ESM natif (Node
// --experimental-vm-modules, cf. le script npm), ce qui évite les pièges du transpile
// CJS sur `import.meta.url` (utilisé par auth.js / mfa.js via createRequire).
module.exports = {
  rootDir: '.',
  testMatch: ['<rootDir>/src/test/integration/**/*.test.js'],
  setupFiles: ['<rootDir>/src/test/integration/env.js'],
  globalSetup: '<rootDir>/src/test/integration/globalSetup.js',
  globalTeardown: '<rootDir>/src/test/integration/globalTeardown.js',
  testTimeout: 30000,
  transform: {},
};
