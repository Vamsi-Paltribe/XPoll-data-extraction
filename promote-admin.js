const mongoose = require('mongoose');
const User = require('./backend/models/User');
const dotenv = require('dotenv');

dotenv.config();

const promote = async (email) => {
    try {
        await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/xpoll');
        const user = await User.findOneAndUpdate({ email }, { isAdmin: true }, { new: true });
        if (user) {
            console.log(`User ${email} is now an ADMIN.`);
        } else {
            console.log(`User ${email} not found.`);
        }
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

const email = process.argv[2];
if (!email) {
    console.log("Usage: node promote-admin.js <email>");
    process.exit(1);
}

promote(email);
