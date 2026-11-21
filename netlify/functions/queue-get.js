const { Storage } = require('./lib/storage');
const { validNarrative } = require('./lib/narrative-validation');

const storage = new Storage('queue-data');

exports.handler = async (event) => {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Content-Type': 'application/json'
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    if (event.httpMethod !== 'GET') {
        return { statusCode: 405, headers, body: 'Method Not Allowed' };
    }

    try {
        const queue = await storage.get('queue') || [];
        return { statusCode: 200, headers, body: JSON.stringify(queue.map(item => ({ ...item, aiLog: validNarrative(item.aiLog) ? item.aiLog : '' }))) };
    } catch (error) {
        console.error('Queue get error:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Failed to get queue' })
        };
    }
};
