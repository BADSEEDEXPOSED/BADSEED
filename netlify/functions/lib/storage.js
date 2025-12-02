// Storage abstraction layer for Netlify Functions
// Uses Netlify Blobs in production, falls back to fs locally

const fs = require('fs');
const path = require('path');

// Detect if running in Netlify production environment
const IS_PRODUCTION = process.env.NETLIFY && !process.env.NETLIFY_DEV;

let getStore;
try {
    const blobsModule = require('@netlify/blobs');
    getStore = blobsModule.getStore;
} catch (err) {
    console.error('Failed to load @netlify/blobs:', err.message);
    getStore = null;
}

class Storage {
    constructor(storeName) {
        this.storeName = storeName;
        if (IS_PRODUCTION && getStore) {
            try {
                this.store = getStore(storeName);
                console.log(`[Storage] Using Netlify Blobs for store: ${storeName}`);
            } catch (err) {
                console.error(`[Storage] Failed to initialize Netlify Blobs:`, err);
                this.store = null;
            }
        } else {
            // Local filesystem fallback
            this.localPath = path.join(__dirname, '..', `${storeName}.json`);
            console.log(`[Storage] Using local filesystem: ${this.localPath}`);
        }
    }

    async get(key) {
        try {
            if (IS_PRODUCTION && this.store) {
                const value = await this.store.get(key);
                return value ? JSON.parse(value) : null;
            } else {
                // Local fs read
                if (fs.existsSync(this.localPath)) {
                    const data = JSON.parse(fs.readFileSync(this.localPath, 'utf8'));
                    return data[key] || null;
                }
                return null;
            }
        } catch (err) {
            console.error(`[Storage] Get error for key "${key}":`, err);
            return null;
        }
    }

    async set(key, value) {
        try {
            if (IS_PRODUCTION && this.store) {
                await this.store.set(key, JSON.stringify(value));
                console.log(`[Storage] Set key "${key}" in Netlify Blobs`);
            } else {
                // Local fs write
                let data = {};
                if (fs.existsSync(this.localPath)) {
                    data = JSON.parse(fs.readFileSync(this.localPath, 'utf8'));
                }
                data[key] = value;
                fs.writeFileSync(this.localPath, JSON.stringify(data, null, 2));
                console.log(`[Storage] Set key "${key}" in local file`);
            }
        } catch (err) {
            console.error(`[Storage] Set error for key "${key}":`, err);
            throw err;
        }
    }

    async delete(key) {
        try {
            if (IS_PRODUCTION && this.store) {
                await this.store.delete(key);
            } else {
                if (fs.existsSync(this.localPath)) {
                    const data = JSON.parse(fs.readFileSync(this.localPath, 'utf8'));
                    delete data[key];
                    fs.writeFileSync(this.localPath, JSON.stringify(data, null, 2));
                }
            }
        } catch (err) {
            console.error(`[Storage] Delete error for key "${key}":`, err);
        }
    }
}

module.exports = { Storage };
