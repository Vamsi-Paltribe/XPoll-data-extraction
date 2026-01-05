const { processDocumentWithOpenAI } = require('./services/openaiProcessor');
require('dotenv').config();

async function testMultiSchema() {
    console.log("🚀 Starting Multi-Schema Verification...");

    // Simulate multi-page document with different schemas
    // Chunk 1: Name, City (using space separator)
    // Chunk 2: Product, Price (using pipe separator)
    const mockText = `
Name      City
John      NewYork
Alice     London
---PAGE_BREAK---
Product | Price | Vendor
Laptop  | $1000 | Dell
Mouse   | $20   | Logi
    `;

    console.log("📝 Input Mock Text (Multi-Schema):", mockText);

    try {
        const result = await processDocumentWithOpenAI({
            data: mockText,
            type: 'text',
            fileName: 'multi_schema_test.txt'
        });

        console.log("✅ Processing Complete!");

        let totalRecords = 0;
        Object.keys(result.data).forEach(state => {
            const records = result.data[state];
            totalRecords += records.length;
            console.log(`\nGroup: ${state}`);
            console.table(records);
        });

        // Expect 2 records from chunk 1 (Unknown state probably) + 2 from chunk 2
        // Ideally we see fields "Name" in some and "Product" in others

        if (totalRecords === 4) {
            console.log("\n✅ SUCCESS: Extracted records from BOTH schemas!");
            process.exit(0);
        } else {
            console.error(`\n❌ FAILURE: Expected 4 records, got ${totalRecords}`);
            process.exit(1);
        }

    } catch (error) {
        console.error("\n❌ ERROR:", error);
        process.exit(1);
    }
}

testMultiSchema();
