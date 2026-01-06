import Redis from 'ioredis';
import dotenv from 'dotenv';
import path from 'path';

// Load env from parent dir
dotenv.config({ path: path.join(__dirname, '../.env') });

const redis = new Redis({
    host: process.env.REDIS_HOST,
    port: Number(process.env.REDIS_PORT),
    password: process.env.REDIS_PASSWORD
});

async function configure() {
    try {
        console.log(`Connecting to Redis at ${process.env.REDIS_HOST}...`);
        // Test connection
        await redis.ping();
        console.log('Connected to Redis.');

        // Set Config
        console.log('Setting maxmemory-policy to noeviction...');
        const result = await redis.config('SET', 'maxmemory-policy', 'noeviction');
        console.log('Result:', result);

        // Verify
        const config = await redis.config('GET', 'maxmemory-policy');
        console.log('Verification:', config);

    } catch (err) {
        console.error('Failed to configure Redis:', err);
    } finally {
        redis.disconnect();
    }
}

configure();
