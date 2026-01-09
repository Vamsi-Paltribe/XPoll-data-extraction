/**
 * Standalone Test Script for Parsing Logic
 * Usage: bun run scripts/test-parsing-local.ts
 * 
 * This script bypasses MongoDB/Worker queues and directly tests the
 * logic extraction pipeline on a provided file/text.
 * Useful for verifying parsing when DB is inaccessible.
 */

import { processDocumentWithOpenAI } from '../services/openaiProcessor';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
dotenv.config();

// CONFIG: Set your test parameters here
const TEST_FILE_NAME = 'test_sample.csv'; // Create this file or change name
const TEST_CONTENT = `Name,Date,Amount
John Doe,2023-01-01,500
Jane Smith,2023-01-02,150
Bob Jones,2023-01-03,200`;

// OR Use a real file if exists
// const REAL_FILE_PATH = path.join(__dirname, '../test-data/my-invoice.pdf');

async function runTest() {
    console.log("=== STARTING LOCAL PARSING TEST ===");
    console.log("Note: This test runs without MongoDB.");

    try {
        // Mock payload mimicking what Worker sends
        // We simulate a CSV file here
        const payload = {
            data: TEST_CONTENT, // Can be base64 if PDF, or text if CSV
            type: 'csv',        // 'pdf', 'csv', 'image', 'text'
            fileName: TEST_FILE_NAME,
            skipConfirmation: true
        };

        console.log(`\n📄 Processing '${payload.fileName}' as '${payload.type}'...`);

        // Timer
        const start = Date.now();

        // EXECUTE PIPELINE
        const result = await processDocumentWithOpenAI(payload);

        const duration = Date.now() - start;

        console.log(`\n✅ SUCCESS! Processing took ${duration}ms`);
        console.log("---------------------------------------------------");
        console.log("LOGIC TIER USED:", result.logicTier);

        // Show Data
        const groups = Object.keys(result.data);
        console.log(`DATA GROUPS FOUND: ${groups.length} (${groups.join(', ')})`);

        if (groups.length > 0) {
            const firstGroup = groups[0];
            const records = result.data[firstGroup];
            console.log(`\nSAMPLE RECORDS (Group: ${firstGroup}):`);
            console.log(JSON.stringify(records.slice(0, 3), null, 2));
            console.log(`... (${records.length} records total)`);
        } else {
            console.warn("⚠️ No data extracted.");
        }

    } catch (error: any) {
        console.error("\n❌ PARSING FAILED:", error.message);
        if (error.response) {
            console.error("OpenAI Error:", error.response.data);
        }
    }
}

runTest();
