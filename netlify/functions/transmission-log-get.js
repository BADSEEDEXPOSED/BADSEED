const { Storage } = require('./lib/storage');

exports.handler = async (event, context) => {
    // CORS
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Content-Type': 'application/json'
    };

    try {
        const storage = new Storage('transmission-log');
        const logs = await storage.get('logs') || [];

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ logs })
        };
    } catch (e) {
        return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
    }
};
