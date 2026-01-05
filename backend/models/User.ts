import mongoose, { Schema, Document } from 'mongoose';

export interface IUser extends Document {
    name: string;
    email: string;
    password?: string;
    googleId?: string;
    avatar?: string;
    tokens: number;
    isAdmin: boolean;
    createdAt: Date;
    updatedAt: Date;
}

const UserSchema: Schema = new Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String }, // Optional if using Google
    googleId: { type: String },
    avatar: { type: String },
    tokens: { type: Number, default: 100 },
    isAdmin: { type: Boolean, default: false }
}, { timestamps: true });

const User = mongoose.model<IUser>('User', UserSchema);
export { User };
