import mongoose, { Schema, Document } from 'mongoose';
import { IBucket } from './Bucket';

export interface ICustomerRecord extends Document {
    bucketId: IBucket['_id'];
    data: any;
    keyHash?: string;
    history: {
        timestamp: Date;
        action: string;
        details?: string;
    }[];
    createdAt: Date;
    updatedAt: Date;
}

const CustomerRecordSchema = new Schema({
    bucketId: { type: mongoose.Schema.Types.ObjectId, ref: 'Bucket', required: true, index: true },

    data: { type: mongoose.Schema.Types.Mixed },

    keyHash: { type: String, index: true }, // Uniqueness is enforced per bucket via compound index below
    // Actually, uniqueness should be per Bucket. 
    // Mongoose unique index needs compound index if we want per-bucket uniqueness.

    history: [{
        timestamp: { type: Date, default: Date.now },
        action: String, // 'imported', 'updated'
        details: String
    }]
}, { timestamps: true });

// Compound Index: bucketId + keyHash must be unique
CustomerRecordSchema.index({ bucketId: 1, keyHash: 1 }, { unique: true });

const CustomerRecord = mongoose.model<ICustomerRecord>('CustomerRecord', CustomerRecordSchema);
export { CustomerRecord };
