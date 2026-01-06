import mongoose, { Schema, Document } from 'mongoose';

export interface IJob extends Document {
    fileUrl: string;
    originalName: string;
    mimeType: string;
    status: 'queued' | 'processing' | 'completed' | 'failed' | 'waiting_approval';
    result: any; // The extracted data
    confidence?: number;
    metrics?: any; // Token usage, time, etc.
    error?: string;
    createdAt: Date;
    updatedAt: Date;
}

const JobSchema: Schema = new Schema({
    fileUrl: { type: String, required: true },
    originalName: { type: String, required: true },
    mimeType: { type: String, required: true },
    status: {
        type: String,
        enum: ['queued', 'processing', 'completed', 'failed', 'waiting_approval'],
        default: 'queued',
        index: true
    },
    result: { type: Schema.Types.Mixed, default: null }, // Flexible for JSON structure
    confidence: { type: Number, default: 0 },
    metrics: { type: Schema.Types.Mixed, default: {} },
    error: { type: String },
}, { timestamps: true });

export default mongoose.model<IJob>('Job', JobSchema);
