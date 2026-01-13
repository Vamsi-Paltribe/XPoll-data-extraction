import mongoose, { Schema, Document } from 'mongoose';
import { IUser } from './User';
import { IBucket } from './Bucket';

export interface ITokenLedger extends Document {
    userId: IUser['_id'];
    type: 'debit' | 'credit';
    amount: number;
    reason: string;
    bucketId?: IBucket['_id'];
    bucketName?: string;
    timestamp: Date;
    createdAt: Date;
    updatedAt: Date;
}

const TokenLedgerSchema = new Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, enum: ['debit', 'credit'], required: true },
    amount: { type: Number, required: true },
    reason: { type: String, required: true }, // e.g., 'Cloud Sync', 'Add Parameter', 'Recharge'
    bucketId: { type: mongoose.Schema.Types.ObjectId, ref: 'Bucket' },
    bucketName: { type: String },
    timestamp: { type: Date, default: Date.now }
}, { timestamps: true });

const TokenLedger = mongoose.model<ITokenLedger>('TokenLedger', TokenLedgerSchema);
export { TokenLedger };
