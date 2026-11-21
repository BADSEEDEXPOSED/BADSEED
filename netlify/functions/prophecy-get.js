const { Storage } = require('./lib/storage');

const storage = new Storage('sentiment-data');

exports.handler = async (event) => {
    if (event.httpMethod !== 'GET') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const data = await storage.get('data') || {
            totalMemos: 0,
            sentiments: { hope: 0, greed: 0, fear: 0, mystery: 0 },
            lastUpdated: '',
            prophecy: { text: '', date: '' }
        };

        const today = new Date().toISOString().split('T')[0];
        const prophecy = data.prophecy || { text: '', date: '' };

        if (prophecy.date === today && prophecy.text) {
            return {
                statusCode: 200,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                body: JSON.stringify({
                    text: prophecy.text.replace(/\s*\(AI Unavailable\)\s*$/i, '').trim(),
                    date: prophecy.date,
                    ready: prophecy.ready || false,
                    x_post_status: prophecy.x_post_status || 'unknown',
                    tweet_id: prophecy.tweetId || null,
                    generation_source: prophecy.generation_source || null,
                    generation_model: prophecy.generation_model || null,
                    revealed_at: prophecy.revealedAt || null,
                    system_status: data.system_status || 'nominal',
                    last_error: prophecy.last_post_error || data.last_error || null
                })
            };
        }

        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({
                text: '',
                date: '',
                ready: false
            })
        };
    } catch (error) {
        console.error('Error getting prophecy:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message })
        };
    }
};
