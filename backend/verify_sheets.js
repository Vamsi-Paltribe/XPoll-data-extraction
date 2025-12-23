const { extractSpreadsheetId, fetchSheetList } = require('./services/stagingService');

async function test() {
    const testUrl = "https://docs.google.com/spreadsheets/d/1wCsebIUQi_YZgYCAsfQyAvyRm3cS2r3OaiDvpkZ8Vyo/edit?gid=0#gid=0";

    console.log("Testing Spreadsheet ID Extraction...");
    const id = extractSpreadsheetId(testUrl);
    console.log("Extracted ID:", id);
    if (id !== "1wCsebIUQi_YZgYCAsfQyAvyRm3cS2r3OaiDvpkZ8Vyo") {
        console.error("FAIL: Incorrect ID extracted");
    } else {
        console.log("PASS: ID extracted correctly");
    }

    // Since we can't easily mock axios in a simple script without extra deps, 
    // we just check if the logic for keyHash generation is correct.

    console.log("\nTesting keyHash generation logic...");
    const mockRec = {
        State: " Arizona ",
        City: "Phoenix",
        Name: "John Doe",
        Email: "john@example.com"
    };

    const state = (mockRec.State || mockRec.STATE || mockRec.state || '').toLowerCase().trim();
    const city = (mockRec.City || mockRec.CITY || mockRec.city || '').toLowerCase().trim();
    const name = (mockRec.Name || mockRec.NAME || mockRec.name || '').toLowerCase().trim();
    const keyHash = `${state}|${city}|${name}`;

    console.log("Generated keyHash:", keyHash);
    if (keyHash === "arizona|phoenix|john doe") {
        console.log("PASS: keyHash generated correctly");
    } else {
        console.error("FAIL: keyHash generation failed");
    }

    console.log("\nSimulation of comparison logic...");
    const existingData = {
        State: " Arizona ",
        City: "Phoenix",
        Name: "John Doe",
        Email: "john_old@example.com"
    };

    const recClean = { ...mockRec };
    delete recClean._sheetName;
    const existingClean = { ...existingData };
    delete existingClean._sheetName;

    const hasConflict = JSON.stringify(existingClean) !== JSON.stringify(recClean);
    console.log("Data changed (Conflict expected):", hasConflict);
    if (hasConflict === true) {
        console.log("PASS: Conflict detected correctly");
    } else {
        console.error("FAIL: Conflict not detected");
    }
}

test().catch(console.error);
