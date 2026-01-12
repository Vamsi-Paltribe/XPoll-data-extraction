import mongoose, { Schema, Document } from 'mongoose';
import { IUser } from './User';

export interface IRecord {
    data: any;
    status: 'pending' | 'confirmed' | 'conflict';
    incomingData?: any;
    history: {
        timestamp: Date;
        action: string;
        previousData: any;
    }[];
}

export interface IParameter {
    name: string;
    type: string;
    mapping?: string;
}

export interface IBucket extends Document {
    name: string;
    description?: string;
    createdBy: IUser['_id'];
    type: 'private' | 'global';
    records: IRecord[];
    sourceUrl: string;
    lastSyncedAt?: Date;
    lastSyncParams?: {
        states: string[];
        cities: string[];
    };
    parameters: IParameter[];
    availableHeaders: string[];
    availableStates: string[];
    availableCities: string[];
    createdAt: Date;
    updatedAt: Date;
}

// Sub-schema for a single record in the bucket
const RecordSchema = new Schema({
    data: { type: mongoose.Schema.Types.Mixed },
    status: {
        type: String,
        enum: ['pending', 'confirmed', 'conflict'],
        default: 'pending'
    },
    // For conflict resolution
    incomingData: { type: mongoose.Schema.Types.Mixed },

    history: [{
        timestamp: { type: Date, default: Date.now },
        action: String,
        previousData: mongoose.Schema.Types.Mixed
    }]
});

const BucketSchema = new Schema({
    name: { type: String, required: true },
    description: { type: String },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    type: {
        type: String,
        enum: ['private', 'global'],
        default: 'private'
    },
    records: [RecordSchema],
    sourceUrl: { type: String, default: '' },
    lastSyncedAt: { type: Date },
    lastSyncParams: {
        states: [String],
        cities: [String]
    },

    // Custom Parameters Configuration
    parameters: [{
        name: { type: String, required: true },
        type: { type: String, default: 'text' }, // text, number, date
        mapping: { type: String } // Column name in source sheet
    }],

    // Auto-Discovered Metadata (Cached for O(1) Access)
    availableHeaders: { type: [String], default: [] },
    availableStates: { type: [String], default: [] },
    availableCities: { type: [String], default: [] }
}, { timestamps: true });

const Bucket = mongoose.model<IBucket>('Bucket', BucketSchema);
export { Bucket };
