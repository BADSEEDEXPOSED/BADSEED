const { Storage } = require('./lib/storage');

const storage = new Storage('sentiment-data');

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const { sentiment } = JSON.parse(event.body);

        // Validate sentiment
        const validSentiments = ['hope', 'greed', 'fear', 'mystery'];
        if (!validSentiments.includes(sentiment)) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'Invalid sentiment. Must be: hope, greed, fear, or mystery' })
            };
        }

        // Get current data
        let data = await storage.get('data') || {
            totalMemos: 0,
            sentiments: { hope: 0, greed: 0, fear: 0, mystery: 0 },
            lastUpdated: '',
            prophecy: { text: '', date: '' }
        };

        // Update sentiment
        data.sentiments[sentiment]++;
        data.totalMemos++;
        data.lastUpdated = new Date().toISOString();

        // Save updated data
        await storage.set('data', data);

        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({ success: true, data, binId: storage.binId })
        };
    } catch (error) {
        console.error('Error updating sentiment:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({
                error: error.message,
                stack: error.stack
            })
        };
    }
};
