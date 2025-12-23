const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('./models/User');
const dotenv = require('dotenv');

dotenv.config();

const seedAdmin = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });
        console.log('MongoDB Connected for Seeding');

        const email = 'admin@gmail.com';
        const password = 'admin';
        const name = 'Admin User';

        let user = await User.findOne({ email });
        if (user) {
            console.log('Admin user already exists');
        } else {
            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash(password, salt);

            user = new User({
                name,
                email,
                password: hashedPassword
            });

            await user.save();
            console.log('Admin user created successfully');
        }

        mongoose.connection.close();
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

seedAdmin();
