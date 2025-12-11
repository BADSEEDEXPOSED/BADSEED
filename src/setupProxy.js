const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function (app) {
    console.log('🔧 Setting up proxy for /.netlify/functions -> https://badseed.netlify.app');
    app.use(
        '/.netlify/functions',
        createProxyMiddleware({
            target: 'https://badseed.netlify.app',
            changeOrigin: true,
            secure: true, // Use SSL
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
