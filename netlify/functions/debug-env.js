// Debug function to test JSONBin API directly
const https = require('https');

exports.handler = async (event) => {
    const key = process.env.JSONBIN_API_KEY;
    const binId = process.env.QUEUE_BIN_ID;

    return new Promise((resolve) => {
        const req = https.request({
            hostname: 'api.jsonbin.io',
            path: `/v3/b/${binId}/latest`,
            method: 'GET',
            headers: {
                'X-Master-Key': key
            }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                resolve({
                    statusCode: 200,
                    body: JSON.stringify({
                        statusCode: res.statusCode,
                        response: data.substring(0, 500),
                        binId,
                        keyUsed: key.substring(0, 20) + '...'
                    })
                });
            });
        });
        req.on('error', (err) => {
            resolve({
                statusCode: 200,
                body: JSON.stringify({ error: err.message })
            });
        });
        req.end();
    });
};
