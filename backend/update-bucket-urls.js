require('dotenv').config();
const mongoose = require('mongoose');
const Bucket = require('./models/Bucket');

const NEW_SOURCE_URL = 'https://docs.google.com/spreadsheets/d/1wCsebIUQi_YZgYCAsfQyAvyRm3cS2r3OaiDvpkZ8Vyo/edit?gid=0#gid=0';

async function updateBucketUrls() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('MongoDB Connected');

        const result = await Bucket.updateMany(
            {}, // Update all buckets
            { $set: { sourceUrl: NEW_SOURCE_URL } }
        );

        console.log(`✅ Updated ${result.modifiedCount} bucket(s) with new source URL`);
        console.log(`New URL: ${NEW_SOURCE_URL}`);

        await mongoose.connection.close();
        console.log('Migration complete!');
        process.exit(0);
    } catch (err) {
        console.error('Migration failed:', err);
        process.exit(1);
    }
}

updateBucketUrls();
