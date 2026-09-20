module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    // Inline .sql migration files so drizzle's expo migrator can bundle them.
    plugins: [['inline-import', { extensions: ['.sql'] }]],
  };
};
