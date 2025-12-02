const { Storage } = require('./lib/storage');

const storage = new Storage('queue-data');

exports.handler = async (event) => {
    if (event.httpMethod !== 'GET') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const queue = await storage.get('queue') || [];

        return {
            statusCode: 200,
            body: JSON.stringify(queue),
            headers: { 'Content-Type': 'application/json' }
        };
    } catch (error) {
        console.error('Queue get error:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Failed to get queue' })
        };
    }
};
