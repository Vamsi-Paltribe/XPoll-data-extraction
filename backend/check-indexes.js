const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();

const checkIndexes = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/xpoll');
        const collection = mongoose.connection.collection('customerrecords');
        const indexes = await collection.indexes();
        console.log('--- CUSTOMER RECORDS INDEXES ---');
        console.log(JSON.stringify(indexes, null, 2));
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

checkIndexes();
