// Storage abstraction layer for Netlify Functions
// Uses Netlify Blobs in production, falls back to fs locally

const { getStore } = require('@netlify/blobs');
const fs = require('fs');
const path = require('path');

// Detect if running in Netlify production environment
const IS_PRODUCTION = process.env.NETLIFY && !process.env.NETLIFY_DEV;

class Storage {
    constructor(storeName) {
        this.storeName = storeName;
        if (IS_PRODUCTION) {
            this.store = getStore(storeName);
        } else {
            // Local filesystem fallback
            this.localPath = path.join(__dirname, '..', `${storeName}.json`);
        }
    }

    async get(key) {
        if (IS_PRODUCTION) {
            const value = await this.store.get(key);
            return value ? JSON.parse(value) : null;
        } else {
            // Local fs read
            try {
                if (fs.existsSync(this.localPath)) {
                    const data = JSON.parse(fs.readFileSync(this.localPath, 'utf8'));
                    return data[key] || null;
                }
            } catch (err) {
                console.error('Local storage read error:', err);
            }
            return null;
        }
    }

    async set(key, value) {
        if (IS_PRODUCTION) {
            await this.store.set(key, JSON.stringify(value));
        } else {
            // Local fs write
            try {
                let data = {};
                if (fs.existsSync(this.localPath)) {
                    data = JSON.parse(fs.readFileSync(this.localPath, 'utf8'));
                }
                data[key] = value;
                fs.writeFileSync(this.localPath, JSON.stringify(data, null, 2));
            } catch (err) {
                console.error('Local storage write error:', err);
                throw err;
            }
        }
    }

    async delete(key) {
        if (IS_PRODUCTION) {
            await this.store.delete(key);
        } else {
            try {
                if (fs.existsSync(this.localPath)) {
                    const data = JSON.parse(fs.readFileSync(this.localPath, 'utf8'));
                    delete data[key];
                    fs.writeFileSync(this.localPath, JSON.stringify(data, null, 2));
                }
            } catch (err) {
                console.error('Local storage delete error:', err);
            }
        }
    }
}

module.exports = { Storage };
