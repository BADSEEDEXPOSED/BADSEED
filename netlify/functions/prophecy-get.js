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

        // Check if prophecy is for today and ready
        if (prophecy.date === today && prophecy.text) {
            return {
                statusCode: 200,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                body: JSON.stringify({
                    text: prophecy.text,
                    date: prophecy.date,
                    ready: prophecy.ready || false
                })
            };
        }

        // No prophecy for today
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
