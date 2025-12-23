const mongoose = require('mongoose');
const dotenv = require('dotenv');
const User = require('./models/User');
const Bucket = require('./models/Bucket');
const CustomerRecord = require('./models/CustomerRecord');

dotenv.config();

const diagnose = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/xpoll');

        const userCount = await User.countDocuments();
        const adminCount = await User.countDocuments({ isAdmin: true });
        const bucketCount = await Bucket.countDocuments();
        const orphanedBuckets = await Bucket.countDocuments({ createdBy: { $exists: false } });
        const recordCount = await CustomerRecord.countDocuments();

        console.log('--- DB DIAGNOSIS ---');
        console.log(`Total Users: ${userCount}`);
        console.log(`Admins: ${adminCount}`);
        console.log(`Total Buckets: ${bucketCount}`);
        console.log(`Orphaned Buckets (no createdBy): ${orphanedBuckets}`);
        console.log(`Total Customer Records: ${recordCount}`);

        if (bucketCount > 0) {
            const firstBucket = await Bucket.findOne();
            console.log('\nSample Bucket:', {
                id: firstBucket._id,
                name: firstBucket.name,
                createdBy: firstBucket.createdBy
            });
        }

        const collections = await mongoose.connection.db.listCollections().toArray();
        console.log('\nCollections:', collections.map(c => c.name));

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

diagnose();
