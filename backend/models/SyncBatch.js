const mongoose = require('mongoose');

const SyncBatchSchema = new mongoose.Schema({
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

module.exports = mongoose.model('SyncBatch', SyncBatchSchema);
