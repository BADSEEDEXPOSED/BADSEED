const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function (app) {
    console.log('🔧 Setting up proxy for /.netlify/functions -> https://badseed.netlify.app');
    app.use(
        createProxyMiddleware({
            target: 'https://badseed.netlify.app',
            changeOrigin: true,
            secure: true,
            pathFilter: '/.netlify/functions',
            logLevel: 'debug',
            onProxyReq: (proxyReq, req, res) => {
                console.log('📤 Proxying:', req.method, req.url, '-> https://badseed.netlify.app' + req.url);
            },
            onError: (err, req, res) => {
                console.error('❌ Proxy error:', err.message);
            }
        })
    );
};
