const fs = require('fs');
const path = require('path');

exports.handler = async () => {
    const file = path.resolve(__dirname, 'queue.json');

    // Ensure file exists
    if (!fs.existsSync(file)) {
        return {
            statusCode: 200,
            body: JSON.stringify([]),
            headers: { 'Content-Type': 'application/json' },
        };
    }

    const data = fs.readFileSync(file, 'utf8');
    return {
        statusCode: 200,
        body: data,
        headers: { 'Content-Type': 'application/json' },
    };
};
