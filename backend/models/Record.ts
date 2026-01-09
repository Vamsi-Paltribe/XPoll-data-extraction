import mongoose, { Schema, Document } from 'mongoose';

export interface IRecord extends Document {
    jobId: mongoose.Schema.Types.ObjectId;
    data: any; // The actual extracted record object
    createdAt: Date;
}

const RecordSchema: Schema = new Schema({
    jobId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Job',
        required: true,
        index: true
    },
    data: {
        type: Schema.Types.Mixed,
        required: true
    }
}, { timestamps: { createdAt: true, updatedAt: false } });

// Compound index just in case we need to search within a job
RecordSchema.index({ jobId: 1, createdAt: -1 });

export default mongoose.model<IRecord>('Record', RecordSchema);
