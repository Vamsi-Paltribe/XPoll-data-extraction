const mongoose = require('mongoose');

// Sub-schema for a single record in the bucket
const RecordSchema = new mongoose.Schema({
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

const BucketSchema = new mongoose.Schema({
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
    availableCities: { type: [String], default: [] }
}, { timestamps: true });

module.exports = mongoose.model('Bucket', BucketSchema);
