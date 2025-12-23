const mongoose = require('mongoose');
const User = require('../models/User');
const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');

dotenv.config({ path: '../.env' });

const createAdmin = async () => {
    const email = 'super@gmail.com';
    const password = 'super';

    try {
        await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/xpoll');

        let user = await User.findOne({ email });

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        if (user) {
            user.password = hashedPassword;
            user.isAdmin = true;
            await user.save();
            console.log(`User ${email} updated and promoted to ADMIN.`);
        } else {
            user = new User({
                name: 'Super Admin',
                email: email,
                password: hashedPassword,
                isAdmin: true,
                tokens: 999999
            });
            await user.save();
            console.log(`Super Admin created: ${email} / ${password}`);
        }
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

createAdmin();
