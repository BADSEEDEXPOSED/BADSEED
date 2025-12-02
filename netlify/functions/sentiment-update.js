const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, 'sentiment-data.json');

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

        // Read current data
        let data = {
            totalMemos: 0,
            sentiments: { hope: 0, greed: 0, fear: 0, mystery: 0 },
            lastUpdated: '',
            prophecy: { text: '', date: '' }
        };

        try {
            const fileData = fs.readFileSync(DATA_FILE, 'utf8');
            data = JSON.parse(fileData);
        } catch (err) {
            console.log('No existing data file, creating new one');
        }

        // Update sentiment
        data.sentiments[sentiment]++;
        data.totalMemos++;
        data.lastUpdated = new Date().toISOString();

        // Write back to file
        fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));

        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({ success: true, data })
        };
    } catch (error) {
        console.error('Error updating sentiment:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message })
        };
    }
};
