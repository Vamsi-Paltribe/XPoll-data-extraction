const mongoose = require('mongoose');

const TokenLedgerSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, enum: ['debit', 'credit'], required: true },
    amount: { type: Number, required: true },
    reason: { type: String, required: true }, // e.g., 'Cloud Sync', 'Add Parameter', 'Recharge'
    bucketId: { type: mongoose.Schema.Types.ObjectId, ref: 'Bucket' },
    timestamp: { type: Date, default: Date.now }
}, { timestamps: true });

module.exports = mongoose.model('TokenLedger', TokenLedgerSchema);
