import { extractMappingLogic, applyLogicToDataset } from '../services/logicExtractor';
import { analyzeJSONStructure } from '../utils/jsonAnalyzer';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

// Load Env
dotenv.config({ path: path.join(__dirname, '../.env') });

const connectDB = async () => {
    const mongoUri = process.env.MONGO_URI || 'mongodb+srv://vamsistark_db_user:VWWCDaru3MBJ46eO@xpoll.re8mx8w.mongodb.net/';
    try {
        await mongoose.connect(mongoUri);
        console.log("DB Connected");
    } catch (err) {
        console.error("DB Connection Failed", err);
    }
};

// MOCK DATA

// 1. JSON Data (Standard)
const mockJson = [
    { "Full Name": "John Doe", "Loc": "New York, NY", "Donation": 500 },
    { "Full Name": "Jane Smith", "Loc": "Los Angeles, CA", "Donation": 150 }
];

// 2. Text Data (Tab Separated Tables - typically from PDF)
const mockTextTable = `
Name\tDate\tAmount\tCity
Alice\t01/01/2023\t$100\tBoston
Bob\t02/01/2023\t$200\tSeattle
`;

// 3. Text Data (Flattened / Regex Needed)
const mockTextFlattened = `
RECORD START: 01/01/2024 | John -> $50 (NY)
RECORD START: 02/01/2024 | Mike -> $20 (FL)
`;

async function runTests() {
    await connectDB();

    console.log("=== TEST 1: JSON STRUCTURE ===");
    try {
        const result = await extractMappingLogic(mockJson, 'json', 'test.json');
        console.log("Result Success:", result.success);
        console.log("Logic Type:", result.logic?.type);
        console.log("Tier:", result.tier);

        if (result.success) {
            const applied = await applyLogicToDataset(mockJson, result.logic, 'test.json');
            console.log("Applied Data Keys:", Object.keys(applied.data || {}));
            console.log("Sample Record:", applied.data?.[Object.keys(applied.data || {})[0]][0]);
        }
    } catch (e: any) {
        console.error("Test 1 Failed:", e.message);
    }

    console.log("\n=== TEST 2: TEXT TABLE (LLM) ===");
    try {
        const result = await extractMappingLogic(mockTextTable, 'text', 'table.txt');
        console.log("Result Success:", result.success);
        console.log("Logic Type:", result.logic?.type);
        console.log("Logic Content:", JSON.stringify(result.logic));

        if (result.success) {
            const applied = await applyLogicToDataset(mockTextTable, result.logic, 'table.txt');
            console.log("Applied Data Keys:", Object.keys(applied.data || {}));
            console.log("Sample Record:", applied.data?.[Object.keys(applied.data || {})[0]][0]);
        }
    } catch (e: any) {
        console.error("Test 2 Failed:", e.message);
    }

    console.log("\n=== TEST 3: TEXT FLATTENED (LLM REGEX) ===");
    try {
        const result = await extractMappingLogic(mockTextFlattened, 'text', 'flat.txt');
        console.log("Result Success:", result.success);
        console.log("Logic Type:", result.logic?.type);
        console.log("Logic Content:", JSON.stringify(result.logic));

        if (result.success) {
            const applied = await applyLogicToDataset(mockTextFlattened, result.logic, 'flat.txt');
            console.log("Applied Data Keys:", Object.keys(applied.data || {}));
            console.log("Sample Record:", applied.data?.[Object.keys(applied.data || {})[0]][0]);
        }
    } catch (e: any) {
        console.error("Test 3 Failed:", e.message);
    }

    await mongoose.disconnect();
}

// Run
runTests().then(() => console.log("Done"));
