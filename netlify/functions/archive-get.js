// API Endpoint: Get Archive Status
// Returns: { pending: [...], history: [...] }
const { Storage } = require('./lib/storage');

const storage = new Storage('sentiment-data');

exports.handler = async (event, context) => {
    // Enable CORS
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Content-Type': 'application/json'
    };

    try {
        const archiveState = await storage.get('archive-state') || { pending: [], history: [] };

        // Summarize for UI (don't send full data payloads if large)
        const pendingSummary = archiveState.pending.map(p => ({
            date: p.date,
            attempts: p.attempts,
            lastAttempt: p.lastAttempt,
            dataSize: JSON.stringify(p.data).length // Just show size
        }));

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                pending: pendingSummary,
                history: archiveState.history,
                chaosMode: pendingSummary.length > 0 // Chaos mode is active if things are pending
            })
        };
    } catch (error) {
        console.error('Archive Get Error:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: 'Failed to fetch archive status' })
        };
    }
};
