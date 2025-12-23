const { fetchHeaders, fetchAndParseSheet, syncToStaging } = require('./services/stagingService');
const mongoose = require('mongoose');
const Bucket = require('./models/Bucket');
const SyncBatch = require('./models/SyncBatch');
const StagingRecord = require('./models/StagingRecord');
const CustomerRecord = require('./models/CustomerRecord');

async function test() {
    try {
        await mongoose.connect('mongodb://localhost:27017/xpoll');
        console.log("Connected to DB");

        const bucket = await Bucket.findOne({ name: 'Campaign Alpha' });
        if (!bucket) {
            console.log("Bucket not found, create one first.");
            process.exit(1);
        }

        console.log("\n--- Testing Header Extraction ---");
        const filters = { states: ['GA'] }; // Test targeted sheet 'Georgia'
        const headers = await fetchHeaders(bucket.sourceUrl, filters);
        console.log("Headers for GA (Georgia sheet):", headers);

        console.log("\n--- Testing Targeted Sync ---");
        const fetchOptions = { targetSheets: ['GA'] };
        const cloudRecords = await fetchAndParseSheet(bucket.sourceUrl, fetchOptions);
        console.log(`Fetched ${cloudRecords.length} records from targeted sheets.`);

        const syncFilters = {
            states: ['GA'],
            selectedHeaders: ['Name', 'City', 'State']
        };
        const result = await syncToStaging(bucket._id, cloudRecords, syncFilters);
        console.log("Sync Result:", result);

        const staging = await StagingRecord.find({ batchId: result.batchId });
        console.log(`Staging contains ${staging.length} records.`);
        if (staging.length > 0) {
            console.log("Sample Staging Record (Keys):", Object.keys(staging[0].data));
        }

        await mongoose.disconnect();
    } catch (err) {
        console.error(err);
    }
}

test();
