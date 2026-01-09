import mongoose from 'mongoose';
import { User } from '../models/User';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

const createAdmin = async () => {
    const upsertUser = async (email: string, password: string, name: string, isAdmin: boolean) => {
        let user = await User.findOne({ email });
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        if (user) {
            user.password = hashedPassword;
            user.isAdmin = isAdmin;
            await user.save();
            console.log(`Updated User: ${email}`);
        } else {
            user = new User({
                name,
                email,
                password: hashedPassword,
                isAdmin,
                tokens: 999999
            });
            await user.save();
            console.log(`Created User: ${email} / ${password} (Admin: ${isAdmin})`);
        }
    };

    try {
        await mongoose.connect(process.env.MONGO_URI || 'mongodb+srv://vamsistark_db_user:VWWCDaru3MBJ46eO@xpoll.re8mx8w.mongodb.net/');

        // 1. Super Admin
        await upsertUser('super@gmail.com', 'super', 'Super Admin', true);

        // 2. Frontend Admin
        await upsertUser('admin@gmail.com', 'admin', 'Frontend Admin', true);

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

createAdmin();
