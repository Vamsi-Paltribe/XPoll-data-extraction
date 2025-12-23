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
    records: [RecordSchema],
    sourceUrl: { type: String, default: 'https://docs.google.com/spreadsheets/d/1wCsebIUQi_YZgYCAsfQyAvyRm3cS2r3OaiDvpkZ8Vyo/edit?gid=0#gid=0' },
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
    }]
}, { timestamps: true });

module.exports = mongoose.model('Bucket', BucketSchema);
