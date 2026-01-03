const mongoose = require('mongoose');
const User = require('../models/User');
const ParsingTemplate = require('../models/ParsingTemplate');
const { extractMappingLogic } = require('../services/logicExtractor');
require('dotenv').config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/xpoll';

async function runTest() {
    try {
        console.log('🔌 Connecting to DB...');
        await mongoose.connect(MONGO_URI);
        console.log('✅ Connected.');

        // 1. Setup Mock User
        // const admin = await User.findOne({ isAdmin: true });
        // if (!admin) throw new Error('No admin user found for test context');

        // 2. Mock Data (Simulating a simple CSV structure)
        const mockData = [
            { "Full Name": "John Doe", "Home City": "New York", "Donation": "500" },
            { "Full Name": "Jane Smith", "Home City": "Los Angeles", "Donation": "100" },
            { "Full Name": "Bob Jones", "Home City": "Chicago", "Donation": "250" }
        ];

        console.log('\n--- TEST STEP 1: INITIAL EXTRACTION (Should be GPT/New) ---');
        // Clear existing template for this test
        const signature = require('crypto').createHash('md5').update(Object.keys(mockData[0]).sort().join('|')).digest('hex');
        await ParsingTemplate.deleteOne({ signature });
        console.log('🧹 Cleared any existing templates for signature:', signature);

        const result1 = await extractMappingLogic(mockData, 'json', 'test-file.csv');
        console.log('Result Source:', result1.source);
        console.log('Confidence:', result1.confidence);
        console.log('Needs LLM:', result1.needsLLM);

        if (result1.source === 'template') {
            throw new Error('❌ Expected "gpt" or "new" source, but got "template" on first run!');
        }
        console.log('✅ STEP 1 PASSED: valid initial extraction.');


        console.log('\n--- TEST STEP 2: SAVE TEMPLATE ---');
        const template = new ParsingTemplate({
            name: 'Test Verify Template',
            signature: signature,
            logic: { type: 'field_mapping', mapping: { "Name": "Full Name", "City": "Home City", "Amount": "Donation" } },
            confidence: 1,
            parsedCount: 0
        });
        await template.save();
        console.log('💾 Template saved to DB.');
        console.log('✅ STEP 2 PASSED.');


        console.log('\n--- TEST STEP 3: RE-EXTRACTION (Should be Template Match) ---');
        const result2 = await extractMappingLogic(mockData, 'json', 'test-file.csv');
        console.log('Result Source:', result2.source);
        console.log('Template Name:', result2.templateName);
        console.log('Token Usage:', result2.tokenUsage);

        if (result2.source !== 'template') {
            throw new Error(`❌ Expected "template" source, but got "${result2.source}"!`);
        }
        if (result2.templateName !== 'Test Verify Template') {
            throw new Error(`❌ Expected template name "Test Verify Template", got "${result2.templateName}"`);
        }
        console.log('✅ STEP 3 PASSED: Instant template match confirmed!');

    } catch (err) {
        console.error('❌ TEST FAILED:', err);
    } finally {
        await mongoose.disconnect();
        process.exit();
    }
}

runTest();
