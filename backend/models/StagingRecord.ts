import mongoose, { Schema, Document } from 'mongoose';
import { IBucket } from './Bucket';
import { ISyncBatch } from './SyncBatch';

export interface IStagingRecord extends Document {
    bucketId: IBucket['_id'];
    batchId: ISyncBatch['_id'];
    data: any;
    keyHash?: string;
    status: 'pending' | 'conflict' | 'ready';
    conflictData?: any;
    importErrors?: string[];
    createdAt: Date;
    updatedAt: Date;
}

const StagingRecordSchema = new Schema({
    bucketId: { type: mongoose.Schema.Types.ObjectId, ref: 'Bucket', required: true, index: true },
    batchId: { type: mongoose.Schema.Types.ObjectId, ref: 'SyncBatch', required: true, index: true },

    // The raw data from the cloud
    data: { type: mongoose.Schema.Types.Mixed },

    // Key used for matching (Name + Committee) - stored hash or string for quick lookup
    keyHash: { type: String, index: true },

    status: {
        type: String,
        enum: ['pending', 'conflict', 'ready'],
        default: 'pending'
    },

    // If conflict, what is the existing data in CustomerRecord?
    conflictData: { type: mongoose.Schema.Types.Mixed },

    importErrors: [String]
}, { timestamps: true });

const StagingRecord = mongoose.model<IStagingRecord>('StagingRecord', StagingRecordSchema);
export { StagingRecord };
