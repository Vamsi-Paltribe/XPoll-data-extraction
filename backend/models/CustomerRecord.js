const mongoose = require('mongoose');

const CustomerRecordSchema = new mongoose.Schema({
    bucketId: { type: mongoose.Schema.Types.ObjectId, ref: 'Bucket', required: true, index: true },

    data: { type: mongoose.Schema.Types.Mixed },

    keyHash: { type: String, index: true }, // Uniqueness is enforced per bucket via compound index below
    // Actually, uniqueness should be per Bucket. 
    // Mongoose unique index needs compound index if we want per-bucket uniqueness.

    history: [{
        timestamp: { type: Date, default: Date.now },
        action: String, // 'imported', 'updated'
        details: String
    }]
}, { timestamps: true });

// Compound Index: bucketId + keyHash must be unique
CustomerRecordSchema.index({ bucketId: 1, keyHash: 1 }, { unique: true });

module.exports = mongoose.model('CustomerRecord', CustomerRecordSchema);
