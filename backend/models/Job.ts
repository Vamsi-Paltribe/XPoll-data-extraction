import mongoose, { Schema, Document } from 'mongoose';

export interface IJob extends Document {
    fileUrl: string; // Deprecated in favor of s3Key but kept for compat? Actually s3Key is better.
    s3Key?: string;
    originalName: string;
    mimeType: string;
    bucketId: string; // Linked Bucket
    status: 'queued' | 'processing' | 'completed' | 'failed' | 'waiting_approval' | 'rejected' | 'paused';
    result: any; // The extracted data
    confidence?: number;
    metrics?: any; // Token usage, time, etc.
    tokensConsumed: number;
    estimatedCost: number;
    rowsProcessed: number;
    userPrompt?: string;
    error?: string;
    createdAt: Date;
    updatedAt: Date;
}

const JobSchema: Schema = new Schema({
    fileUrl: { type: String, required: false }, // Optional now if we use s3Key
    s3Key: { type: String },
    originalName: { type: String, required: true },
    mimeType: { type: String, required: true },
    bucketId: { type: String, required: false, index: true },
    status: {
        type: String,
        enum: ['queued', 'processing', 'completed', 'failed', 'waiting_approval', 'rejected', 'paused'],
        default: 'queued',
        index: true
    },
    result: { type: Schema.Types.Mixed, default: null },
    confidence: { type: Number, default: 0 },
    metrics: { type: Schema.Types.Mixed, default: {} },
    tokensConsumed: { type: Number, default: 0 },
    estimatedCost: { type: Number, default: 0 },
    rowsProcessed: { type: Number, default: 0 },
    userPrompt: { type: String },
    error: { type: String },
}, { timestamps: true });

export default mongoose.model<IJob>('Job', JobSchema);
