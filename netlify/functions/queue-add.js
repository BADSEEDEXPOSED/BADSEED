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

    const { memo, aiLog, timestamp } = body;
    if (!memo) {
        return { statusCode: 400, body: 'Missing memo' };
    }

    try {
        // [NEW] Get posted history to prevent re-queuing old items
        const history = await storage.get('posted-history') || [];
        if (history.includes(memo)) {
            return {
                statusCode: 200,
                body: JSON.stringify({ message: 'Already posted (history)', skipped: true })
            };
        }

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
            // Use provided timestamp or fallback to now
            createdAt: timestamp || new Date().toISOString()
        };

        queue.push(newItem);

        // Save updated queue
        await storage.set('queue', queue);

        return {
            statusCode: 201,
            body: JSON.stringify({ ...newItem, binId: storage.binId }),
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
