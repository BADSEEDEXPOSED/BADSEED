const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, 'sentiment-data.json');

exports.handler = async (event) => {
    try {
        // Read sentiment data
        const data = fs.readFileSync(DATA_FILE, 'utf8');
        const sentimentData = JSON.parse(data);

        // Get today's date in YYYY-MM-DD format
        const today = new Date().toISOString().split('T')[0];

        // Check if prophecy exists and is for today
        const prophecy = sentimentData.prophecy || { text: '', date: '' };

        // If no prophecy for today, return empty/waiting state
        if (!prophecy.text || prophecy.date !== today) {
            return {
                statusCode: 200,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                body: JSON.stringify({
                    text: '',
                    date: today,
                    ready: false
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
                text: prophecy.text,
                date: prophecy.date,
                ready: true
            })
        };
    } catch (error) {
        console.error('Error reading prophecy:', error);

        const today = new Date().toISOString().split('T')[0];
        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({
                text: '',
                date: today,
                ready: false
            })
        };
    }
};
