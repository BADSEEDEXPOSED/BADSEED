const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function (app) {
    app.use(
        '/.netlify/functions',
        createProxyMiddleware({
            target: 'http://localhost:9999',
            pathRewrite: {
                '^/.netlify/functions': '', // remove /.netlify/functions prefix
            },
            changeOrigin: true,
        })
    );
};
