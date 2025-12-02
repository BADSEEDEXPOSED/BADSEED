const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, 'sentiment-data.json');

exports.handler = async (event) => {
    try {
        // Read sentiment data
        const data = fs.readFileSync(DATA_FILE, 'utf8');
        const sentimentData = JSON.parse(data);

        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify(sentimentData)
        };
    } catch (error) {
        console.error('Error reading sentiment data:', error);

        // Return default data if file doesn't exist or is corrupted
        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({
                totalMemos: 0,
                sentiments: { hope: 0, greed: 0, fear: 0, mystery: 0 },
                lastUpdated: '',
                prophecy: { text: '', date: '' }
            })
        };
    }
};
