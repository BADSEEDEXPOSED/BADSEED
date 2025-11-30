const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function (app) {
    console.log('🔧 Setting up proxy for /.netlify/functions -> http://localhost:9998');
    app.use(
        '/.netlify/functions',
        createProxyMiddleware({
            target: 'http://localhost:9998',
            changeOrigin: true,
            pathRewrite: {
                '^/': '/.netlify/functions/'
            },
            logLevel: 'debug',
            onProxyReq: (proxyReq, req, res) => {
                console.log('📤 Proxying:', req.method, req.url, '-> http://localhost:9998' + req.url);
            },
            onError: (err, req, res) => {
                console.error('❌ Proxy error:', err.message);
            }
        })
    );
};
