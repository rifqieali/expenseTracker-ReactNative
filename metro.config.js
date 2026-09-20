const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Allow importing .sql files (drizzle migrations, inlined by babel-plugin-inline-import).
config.resolver.sourceExts.push('sql');

// expo-sqlite web runs on wa-sqlite (wasm); let Metro bundle the .wasm asset.
config.resolver.assetExts.push('wasm');

module.exports = config;
