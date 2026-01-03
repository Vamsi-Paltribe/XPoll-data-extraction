const mongoose = require('mongoose');
const User = require('./models/User');
require('dotenv').config();

async function checkUsers() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to Mongo');

        const totalUsers = await User.countDocuments();
        const admins = await User.countDocuments({ isAdmin: true });
        const regular = await User.countDocuments({ isAdmin: { $ne: true } });

        console.log(`Total Users: ${totalUsers}`);
        console.log(`Admins: ${admins}`);
        console.log(`Regular Users: ${regular}`);

        if (totalUsers > 0) {
            const all = await User.find({}, 'name email isAdmin');
            console.log('User List:', JSON.stringify(all, null, 2));
        }

    } catch (err) {
        console.error(err);
    } finally {
        await mongoose.disconnect();
    }
}

checkUsers();
