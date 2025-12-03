const { Storage } = require('./lib/storage');
const { randomUUID } = require('crypto');

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

    const { memo, aiLog } = body;
    if (!memo) {
        return { statusCode: 400, body: 'Missing memo' };
    }

    try {
        // Get current queue
        let queue = await storage.get('queue') || [];

        // Check if already queued
        const exists = queue.some(item => item.memo === memo);
        if (exists) {
            return {
                statusCode: 200,
                body: JSON.stringify({ message: 'Already queued', skipped: true })
            };
        }

        // Add new item
        const newItem = {
            id: randomUUID(),
            memo,
            aiLog: aiLog || '',
            createdAt: new Date().toISOString()
        };

        queue.push(newItem);

        // Save updated queue
        await storage.set('queue', queue);

        return {
            statusCode: 201,
            body: JSON.stringify(newItem),
            headers: { 'Content-Type': 'application/json' }
        };
    } catch (error) {
        console.error('Queue add error:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({
                error: 'Failed to add to queue',
                details: error.message,
                stack: error.stack
            })
        };
    }
};
