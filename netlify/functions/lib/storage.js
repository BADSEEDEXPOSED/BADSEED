// Storage abstraction using JSONBin.io for serverless persistence
// Free tier: 10k requests/month, perfect for this use case

const JSONBIN_API_KEY = process.env.JSONBIN_API_KEY || '$2a$10$mock.key.for.local.dev';
const JSONBIN_BASE_URL = 'https://api.jsonbin.io/v3/b';

// Bin IDs for different stores (will be created on first use)
const BIN_IDS = {
    'queue-data': process.env.QUEUE_BIN_ID || null,
    'sentiment-data': process.env.SENTIMENT_BIN_ID || null
};

class Storage {
    constructor(storeName) {
        this.storeName = storeName;
        this.binId = BIN_IDS[storeName];
        this.cache = null;
        this.cacheTime = 0;
        this.CACHE_TTL = 5000; // 5 seconds cache
    }

    async _fetch(url, options = {}) {
        const https = require('https');
        const { URL } = require('url');

        return new Promise((resolve, reject) => {
            const parsedUrl = new URL(url);
            const requestOptions = {
                method: options.method || 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Access-Key': JSONBIN_API_KEY,
                    ...options.headers
                }
            };

            const req = https.request(parsedUrl, requestOptions, (res) => {
                let data = '';
                res.on('data', (chunk) => data += chunk);
                res.on('end', () => {
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        try {
                            resolve(JSON.parse(data));
                        } catch (e) {
                            reject(new Error('Invalid JSON response'));
                        }
                    } else {
                        reject(new Error(`HTTP ${res.statusCode}: ${data}`));
                    }
                });
            });

            req.on('error', (err) => {
                console.error('[Storage] Request error:', err);
                reject(err);
            });

            if (options.body) {
                req.write(options.body);
            }
            req.end();
        });
    }

    async _ensureBin() {
        if (this.binId) return this.binId;

        // Create a new bin
        const data = { [this.storeName]: {} };
        const result = await this._fetch(JSONBIN_BASE_URL, {
            method: 'POST',
            body: JSON.stringify(data)
        });

        this.binId = result.metadata.id;
        console.log(`[Storage] Created new bin for ${this.storeName}: ${this.binId}`);
        console.log(`[Storage] Add to .env: ${this.storeName.toUpperCase().replace('-', '_')}_BIN_ID=${this.binId}`);

        return this.binId;
    }

    async _loadAll() {
        const now = Date.now();
        if (this.cache && (now - this.cacheTime) < this.CACHE_TTL) {
            return this.cache;
        }

        const binId = await this._ensureBin();
        const result = await this._fetch(`${JSONBIN_BASE_URL}/${binId}/latest`);

        this.cache = result.record || {};
        this.cacheTime = now;
        return this.cache;
    }

    async _saveAll(data) {
        const binId = await this._ensureBin();
        await this._fetch(`${JSONBIN_BASE_URL}/${binId}`, {
            method: 'PUT',
            body: JSON.stringify(data)
        });

        this.cache = data;
        this.cacheTime = Date.now();
    }

    async get(key) {
        try {
            const data = await this._loadAll();
            return data[key] || null;
        } catch (err) {
            console.error(`[Storage] Get error for key "${key}":`, err.message);
            return null;
        }
    }

    async set(key, value) {
        try {
            const data = await this._loadAll();
            data[key] = value;
            await this._saveAll(data);
            console.log(`[Storage] Set key "${key}" in ${this.storeName}`);
        } catch (err) {
            console.error(`[Storage] Set error for key "${key}":`, err.message);
            throw err;
        }
    }

    async delete(key) {
        try {
            const data = await this._loadAll();
            delete data[key];
            await this._saveAll(data);
        } catch (err) {
            console.error(`[Storage] Delete error for key "${key}":`, err.message);
        }
    }
}

module.exports = { Storage };
