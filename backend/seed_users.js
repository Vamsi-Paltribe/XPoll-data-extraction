const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('./models/User');
const dotenv = require('dotenv');

dotenv.config();

const seedUsers = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/xpoll');
        console.log('Connected to MongoDB');

        // Clear existing users
        await User.deleteMany({});
        console.log('Cleared User collection');

        // Hash passwords
        const salt = await bcrypt.genSalt(10);
        const superPass = await bcrypt.hash('super', salt);
        const adminPass = await bcrypt.hash('admin', salt);

        // Create Super Admin
        const superAdmin = new User({
            name: 'Super Admin',
            email: 'super@gmail.com',
            password: superPass,
            isAdmin: true,
            tokens: 999999
        });
        await superAdmin.save();
        console.log('Created Super Admin: super@gmail.com');

        // Create Admin
        const admin = new User({
            name: 'Admin User',
            email: 'admin@gmail.com',
            password: adminPass,
            isAdmin: true,
            tokens: 1000
        });
        await admin.save();
        console.log('Created Admin: admin@gmail.com');

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

seedUsers();
