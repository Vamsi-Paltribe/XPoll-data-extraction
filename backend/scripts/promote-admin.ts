import mongoose from 'mongoose';
import { User } from '../models/User';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

const promote = async (email: string) => {
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
    console.log("Usage: npx ts-node backend/scripts/promote-admin.ts <email>");
    process.exit(1);
}

promote(email);
