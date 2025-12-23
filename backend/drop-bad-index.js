const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();

const dropIndex = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/xpoll');
        const collection = mongoose.connection.collection('customerrecords');

        console.log('Dropping index keyHash_1...');
        await collection.dropIndex('keyHash_1');
        console.log('Index keyHash_1 dropped successfully.');

        const indexes = await collection.indexes();
        console.log('\nCurrent Indexes:', JSON.stringify(indexes, null, 2));

        process.exit(0);
    } catch (err) {
        console.error('Error dropping index:', err.message);
        process.exit(1);
    }
};

dropIndex();
