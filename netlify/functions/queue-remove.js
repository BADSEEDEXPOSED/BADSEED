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

    const { id, ids } = body;

    // Support both single 'id' and array of 'ids'
    const idsToRemove = ids || (id ? [id] : []);

    if (idsToRemove.length === 0) {
        return { statusCode: 400, body: 'Missing id or ids' };
    }

    try {
        let queue = await storage.get('queue') || [];
        const initialLength = queue.length;

        // Find items properly before removing them to get memos
        const itemsToRemove = queue.filter(item => idsToRemove.includes(item.id));

        // Filter out the items
        queue = queue.filter(item => !idsToRemove.includes(item.id));

        const removedCount = initialLength - queue.length;

        if (removedCount === 0) {
            return {
                statusCode: 404,
                body: JSON.stringify({ error: 'Items not found' })
            };
        }

        await storage.set('queue', queue);
        console.log(`[Queue] Removed ${removedCount} items`);

        // Update posted-history
        if (itemsToRemove.length > 0) {
            try {
                let history = await storage.get('posted-history') || [];
                let historyUpdated = false;

                itemsToRemove.forEach(item => {
                    if (item.memo && !history.includes(item.memo)) {
                        history.push(item.memo);
                        historyUpdated = true;
                    }
                });

                // Keep history size manageable (last 200 items)
                if (history.length > 200) {
                    history = history.slice(history.length - 200);
                    historyUpdated = true;
                }

                if (historyUpdated) {
                    await storage.set('posted-history', history);
                    console.log(`[Queue] Added ${itemsToRemove.length} items to history`);
                }
            } catch (err) {
                console.error('[Queue] Failed to update history:', err);
                // Non-fatal
            }
        }

        return {
            statusCode: 200,
            body: JSON.stringify({ success: true, removed: idsToRemove, count: removedCount }),
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
