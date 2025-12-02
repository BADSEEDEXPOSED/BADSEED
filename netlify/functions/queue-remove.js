const { Storage } = require('./lib/storage');

const storage = new Storage('queue-data');

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    let body;
    try {
        body = JSON.parse(event.body);
    } catch (e) {
        return { statusCode: 400, body: 'Invalid JSON' };
    }

    const { id } = body;
    if (!id) {
        return { statusCode: 400, body: 'Missing id' };
    }

    try {
        let queue = await storage.get('queue') || [];
        const initialLength = queue.length;

        queue = queue.filter(item => item.id !== id);

        if (queue.length === initialLength) {
            return {
                statusCode: 404,
                body: JSON.stringify({ error: 'Item not found' })
            };
        }

        await storage.set('queue', queue);

        return {
            statusCode: 200,
            body: JSON.stringify({ success: true, removed: id }),
            headers: { 'Content-Type': 'application/json' }
        };
    } catch (error) {
        console.error('Queue remove error:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Failed to remove from queue' })
        };
    }
};
