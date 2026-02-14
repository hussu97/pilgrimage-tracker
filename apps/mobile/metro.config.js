const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const config = getDefaultConfig(projectRoot);

// Pin module resolution to apps/mobile/node_modules only.
// This prevents Metro from traversing up to the monorepo root and picking up
// a different React version installed for apps/web.
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
];

module.exports = config;
