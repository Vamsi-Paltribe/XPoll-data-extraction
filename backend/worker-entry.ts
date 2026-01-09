import { setupWorker } from './queue/worker';
import { setupCommitWorker } from './queue/commitWorker';

import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

// Connect to MongoDB if worker needs it (optional, but good practice)
const mongoUri = process.env.MONGO_URI || 'mongodb+srv://vamsistark_db_user:VWWCDaru3MBJ46eO@xpoll.re8mx8w.mongodb.net/';
mongoose.set('strictQuery', false); // Suppress warning

mongoose.connect(mongoUri)
    .then(() => {
        console.log('MongoDB Connected for Worker');
        console.log('Worker Script Initializing...');
        setupWorker();
        setupCommitWorker();
    })
    .catch((err) => {
        console.error('MongoDB Connection Error:', err);
        // Even if Mongo fails, we might still want to run the worker if it doesn't strictly depend on Mongo for *processing* (though it usually does)
        // For now, let's start it.
        setupWorker();
    });
