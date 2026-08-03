/**
 * Babel configuration.
 *
 * `react-native-reanimated/plugin` must stay last in the plugin list — it
 * rewrites worklets and silently produces broken animations if another plugin
 * transforms the same nodes after it.
 */
module.exports = function babelConfig(api) {
  api.cache(true);

  return {
    presets: [['babel-preset-expo', { jsxImportSource: 'react' }]],
    plugins: ['react-native-reanimated/plugin'],
  };
};
