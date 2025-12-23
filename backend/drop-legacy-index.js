const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config();

const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('MongoDB Connected');

        const collection = mongoose.connection.collection('customerrecords');
        const indexes = await collection.indexes();
        console.log('Current Indexes:', indexes);

        // Drop keyHash_ if it exists and is unique (or just drop it to be safe, since we use the compound one)
        // The compound one is usually named 'bucketId_1_keyHash_1'

        try {
            await collection.dropIndex('keyHash_1');
            console.log('Dropped keyHash_1 (if existed)');
        } catch (e) {
            console.log('keyHash_1 not found or drop failed:', e.message);
        }

        try {
            await collection.dropIndex('keyHash_');
            console.log('Dropped keyHash_ (if existed)');
        } catch (e) {
            console.log('keyHash_ not found or drop failed:', e.message);
        }

        console.log('Index cleanup complete. Ensure schemas recreate necessary indexes on app start.');
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

connectDB();
