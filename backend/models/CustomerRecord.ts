import mongoose, { Schema, Document } from 'mongoose';
import { IBucket } from './Bucket';

export interface ICustomerRecord extends Document {
    bucketId: IBucket['_id'];
    data: any;
    keyHash?: string;
    lineage?: {
        bucketId: mongoose.Types.ObjectId;
        recordId: mongoose.Types.ObjectId;
        mergedAt: Date;
    }[];
    isMergeResult?: boolean;
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

    keyHash: { type: String, index: true },

    lineage: [{
        bucketId: { type: mongoose.Schema.Types.ObjectId, ref: 'Bucket' },
        recordId: { type: mongoose.Schema.Types.ObjectId },
        mergedAt: { type: Date, default: Date.now }
    }],
    isMergeResult: { type: Boolean, default: false },

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
