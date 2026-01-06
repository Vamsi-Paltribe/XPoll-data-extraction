import { setupWorker } from './queue/worker';
import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

// Connect to MongoDB if worker needs it (optional, but good practice)
const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/xpoll';

mongoose.connect(mongoUri)
    .then(() => {
        console.log('MongoDB Connected for Worker');
        setupWorker();
    })
    .catch((err) => {
        console.error('MongoDB Connection Error:', err);
        // Even if Mongo fails, we might still want to run the worker if it doesn't strictly depend on Mongo for *processing* (though it usually does)
        // For now, let's start it.
        setupWorker();
    });
