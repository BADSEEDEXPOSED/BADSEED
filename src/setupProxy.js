const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function (app) {
    console.log('Setting up proxy for /.netlify/functions -> https://badseed.exposed');
    app.use(
        createProxyMiddleware({
            target: 'https://badseed.exposed',
            changeOrigin: true,
            secure: true,
            pathFilter: '/.netlify/functions',
            logLevel: 'debug',
            onProxyReq: (proxyReq, req, res) => {
                console.log('Proxying:', req.method, req.url, '-> https://badseed.exposed' + req.url);
            },
            onError: (err, req, res) => {
                console.error('Proxy error:', err.message);
            }
        })
    );
};
