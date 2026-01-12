import mongoose, { Schema, Document } from 'mongoose';

export interface IGlobalParameter {
    name: string;
    type: string;
    description?: string;
}

export interface IGlobalSettings extends Document {
    key: string; // e.g., 'global_schema'
    value: any;  // JSON value
    updatedBy: mongoose.Types.ObjectId;
}

const GlobalSettingsSchema = new Schema({
    key: { type: String, required: true, unique: true },
    value: { type: Schema.Types.Mixed, required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

export const GlobalSettings = mongoose.model<IGlobalSettings>('GlobalSettings', GlobalSettingsSchema);
