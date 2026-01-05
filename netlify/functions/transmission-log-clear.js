const { Storage } = require('./lib/storage');

exports.handler = async (event, context) => {
    // CORS
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Content-Type': 'application/json'
    };

    if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
    if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: 'Methods Not Allowed' };

    try {
        const storage = new Storage('transmission-log');
        await storage.set('logs', []); // Wipe logs

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ success: true, message: "Logs Cleared" })
        };
    } catch (e) {
        return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
    }
};
