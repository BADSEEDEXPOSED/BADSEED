const { Storage } = require('./lib/storage');

const storage = new Storage('queue-data');
const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

exports.handler = async (event) => {
    if (event.httpMethod !== 'GET') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        let queue = await storage.get('queue') || [];
        const now = Date.now();

        // Filter out items older than 24 hours
        const originalLength = queue.length;
        queue = queue.filter(item => {
            const createdAt = new Date(item.createdAt).getTime();
            const age = now - createdAt;
            return age < TWENTY_FOUR_HOURS;
        });

        // If any items were removed, save the cleaned queue
        if (queue.length < originalLength) {
            await storage.set('queue', queue);
            console.log(`[Queue] Cleaned up ${originalLength - queue.length} expired items`);
        }

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
