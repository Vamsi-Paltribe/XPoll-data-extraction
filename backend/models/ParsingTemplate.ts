import mongoose, { Schema, Document } from 'mongoose';
import { IUser } from './User';

export interface IParsingTemplate extends Document {
    name: string;
    signature: string;
    logic: any;
    confidence: number;
    sampleData?: any;
    createdBy?: IUser['_id'];
    usageCount: number;
    lastUsedAt: Date;
    createdAt: Date;
    updatedAt: Date;
}

const ParsingTemplateSchema = new Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    signature: {
        type: String,
        required: true,
        unique: true,
        index: true,
        description: 'Unique hash or string representation of the file structure (e.g. sorted headers)'
    },
    logic: {
        type: Object,
        required: true,
        description: 'The extraction logic (mapping object or parsing function string)'
    },
    confidence: {
        type: Number,
        default: 0
    },
    sampleData: {
        type: Object,
        description: 'A small sample of the data this template was created from (for reference)'
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    usageCount: {
        type: Number,
        default: 0
    },
    lastUsedAt: {
        type: Date,
        default: Date.now
    }
}, { timestamps: true });

const ParsingTemplate = mongoose.model<IParsingTemplate>('ParsingTemplate', ParsingTemplateSchema);
export { ParsingTemplate };
