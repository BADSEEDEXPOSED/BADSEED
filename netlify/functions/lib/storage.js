// Storage abstraction using Upstash Redis for serverless persistence
// Free tier: 10,000 commands/day - much more generous than JSONBin

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

console.log('[DEBUG PROBE] Storage Module Loaded. Keys accessible:', {
    url: !!UPSTASH_URL,
    token: !!UPSTASH_TOKEN
});

class Storage {
    constructor(storeName) {
        this.storeName = storeName;
        this.cache = null;
        this.cacheTime = 0;
        this.CACHE_TTL = 5000; // 5 seconds cache
    }

    async _fetch(command, ...args) {
        if (!UPSTASH_URL || !UPSTASH_TOKEN) {
            throw new Error('Upstash credentials not configured');
        }

        const response = await fetch(`${UPSTASH_URL}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${UPSTASH_TOKEN}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify([command, ...args])
        });

        if (!response.ok) {
            const text = await response.text();
            throw new Error(`Upstash HTTP ${response.status}: ${text}`);
        }

        const data = await response.json();
        if (data.error) {
            throw new Error(`Upstash error: ${data.error}`);
        }

        return data.result;
    }

    async get(key) {
        try {
            const fullKey = `${this.storeName}:${key}`;
            const now = Date.now();

            // Check cache
            if (this.cache && this.cache[key] && (now - this.cacheTime) < this.CACHE_TTL) {
                return this.cache[key];
            }

            const result = await this._fetch('GET', fullKey);
            if (result) {
                const parsed = JSON.parse(result);
                if (!this.cache) this.cache = {};
                this.cache[key] = parsed;
                this.cacheTime = now;
                return parsed;
            }
            return null;
        } catch (err) {
            console.error(`[Storage] Get error for key "${key}":`, err.message);
            return null;
        }
    }

    async set(key, value) {
        try {
            const fullKey = `${this.storeName}:${key}`;
            const jsonValue = JSON.stringify(value);
            await this._fetch('SET', fullKey, jsonValue);

            // Update cache
            if (!this.cache) this.cache = {};
            this.cache[key] = value;
            this.cacheTime = Date.now();

            console.log(`[Storage] Set key "${key}" in ${this.storeName}`);
        } catch (err) {
            console.error(`[Storage] Set error for key "${key}":`, err.message);
            throw err;
        }
    }

    async delete(key) {
        try {
            const fullKey = `${this.storeName}:${key}`;
            await this._fetch('DEL', fullKey);

            // Clear from cache
            if (this.cache && this.cache[key]) {
                delete this.cache[key];
            }

            console.log(`[Storage] Deleted key "${key}" from ${this.storeName}`);
        } catch (err) {
            console.error(`[Storage] Delete error for key "${key}":`, err.message);
        }
    }
}

module.exports = { Storage };
