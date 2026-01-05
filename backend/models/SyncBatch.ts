import mongoose, { Schema, Document } from 'mongoose';
import { IBucket } from './Bucket';

export interface ISyncBatch extends Document {
    bucketId: IBucket['_id'];
    recordCount: number;
    conflictCount: number;
    status: 'pending' | 'committed' | 'rejected';
    filters?: {
        states: string[];
        cities: string[];
    };
    createdAt: Date;
    updatedAt: Date;
}

const SyncBatchSchema = new Schema({
    bucketId: { type: mongoose.Schema.Types.ObjectId, ref: 'Bucket', required: true, index: true },

    // Batch Metadata
    recordCount: { type: Number, default: 0 },
    conflictCount: { type: Number, default: 0 },

    status: {
        type: String,
        enum: ['pending', 'committed', 'rejected'],
        default: 'pending'
    },

    // Filters used for this sync
    filters: {
        states: [String],
        cities: [String]
    }
}, { timestamps: true });

const SyncBatch = mongoose.model<ISyncBatch>('SyncBatch', SyncBatchSchema);
export { SyncBatch };
