const mongoose = require('mongoose');
const dotenv = require('dotenv');
const User = require('./models/User');
const Bucket = require('./models/Bucket');

dotenv.config();

const migrate = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/xpoll');

        // Find the first non-admin user
        const user = await User.findOne({ isAdmin: { $ne: true } });

        if (!user) {
            console.log('No regular user found to assign buckets to.');
            process.exit(0);
        }

        console.log(`Assigning orphaned buckets to user: ${user.email} (${user._id})`);

        const result = await Bucket.updateMany(
            { createdBy: { $exists: false } },
            { $set: { createdBy: user._id } }
        );

        console.log(`Migration Complete: ${result.modifiedCount} buckets updated.`);
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

migrate();
