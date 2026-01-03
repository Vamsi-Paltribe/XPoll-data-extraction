const { extractMappingLogic, applyLogicToDataset } = require('../services/logicExtractor');
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/xpoll';

// Generate Dummy Data (600 rows)
function generateLargeDataset(count) {
    const data = [];
    const cities = ['New York', 'Los Angeles', 'Chicago', 'Houston', 'Phoenix'];
    const states = ['NY', 'CA', 'IL', 'TX', 'AZ'];

    for (let i = 0; i < count; i++) {
        const rand = Math.floor(Math.random() * 5);
        data.push({
            "Worker Name": `Worker ${i}`,
            "Location City": cities[rand],
            "Location State": states[rand],
            "Salary Amount": (Math.random() * 100000).toFixed(2),
            "Shift": i % 2 === 0 ? "Day" : "Night"
        });
    }
    return data;
}

async function runLargeTest() {
    try {
        console.log('\n🚀 STARTING LARGE DATASET VERIFICATION (600 Rows)\n');

        // 1. Generate Data
        const dataset = generateLargeDataset(600);
        console.log(`📦 Generated ${dataset.length} rows of dummy data.`);
        console.log('Sample Record:', dataset[0]);

        // 2. Clear Template (force new logic extraction)
        await mongoose.connect(MONGO_URI);
        const ParsingTemplate = require('../models/ParsingTemplate');
        // Simple signature for this structure
        const signature = require('crypto').createHash('md5').update(Object.keys(dataset[0]).sort().join('|')).digest('hex');
        await ParsingTemplate.deleteOne({ signature });
        console.log('🧹 Cleared existing templates for clean test.');

        // 3. Run Logic Extraction (Simulate Upload)
        console.log('\n--- PHASE 1: LOGIC EXTRACTION (Simulating LLM on Sample) ---');
        // This should trigger the "Medium Confidence" path or "High Confidence" if local analysis is smart enough. 
        // For this distinct structure, local might fail or be medium.

        // Force "Medium Confidence" for test? logicExtractor analyzes structure locally first.
        const logicResult = await extractMappingLogic(dataset.slice(0, 100), 'json', 'large-test.json');

        console.log(`\n🔍 Extraction Result Source: ${logicResult.source}`);
        console.log(`CONFIDENCE: ${logicResult.confidence}`);

        // 4. Apply Logic to Full Dataset
        if (logicResult.success && logicResult.logic) {
            console.log('\n--- PHASE 2: APPLYING LOGIC TO FULL DATASET (600 Rows) ---');
            const applicationResult = await applyLogicToDataset(dataset, logicResult.logic, 'large-test.json');

            console.log(`\n✅ Application Success: ${applicationResult.success}`);
            if (applicationResult.success) {
                const processedCount = applicationResult.recordsProcessed;
                console.log(`📊 Records Processed: ${processedCount}/${dataset.length}`);

                // Verify Grouping
                const stateGroups = Object.keys(applicationResult.data);
                console.log(`States Found: ${stateGroups.join(', ')}`);
            } else {
                console.error('❌ Application Failed:', applicationResult.error);
            }
        } else {
            console.error('❌ Extraction Failed:', logicResult.message);
        }

        // 5. Check Logs
        const logPath = path.join(__dirname, '../../logs/data-ingestion.txt');
        if (fs.existsSync(logPath)) {
            console.log(`\n📄 Log file created at: ${logPath}`);
            const logs = fs.readFileSync(logPath, 'utf8');
            console.log('\n--- LOG FILE PREVIEW (Last 10 lines) ---');
            console.log(logs.split('\n').slice(-10).join('\n'));
        } else {
            console.error('❌ Log file NOT found!');
        }

    } catch (err) {
        console.error('❌ TEST FAILED:', err);
    } finally {
        await mongoose.disconnect();
        process.exit();
    }
}

runLargeTest();
