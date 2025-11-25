const webpack = require('webpack');

module.exports = function override(config) {
    // Minimal polyfills - only what's needed for basic React app
    config.plugins = (config.plugins || []).concat([
        new webpack.ProvidePlugin({
            Buffer: ['buffer', 'Buffer']
        })
    ]);

    config.ignoreWarnings = [/Failed to parse source map/];
    return config;
};
