const { fetchAndParseSheet, mergeRecords } = require('./services/cloudSync');

(async () => {
    console.log('--- Starting Cloud Sync Verification ---');

    // 1. Fetch from Google Sheet
    console.log('Fetching from Google Cloud...');
    let cloudRecords;
    try {
        cloudRecords = await fetchAndParseSheet('https://docs.google.com/spreadsheets/d/1wCsebIUQi_YZgYCAsfQyAvyRm3cS2r3OaiDvpkZ8Vyo/edit?usp=sharing');
        console.log(`Fetched ${cloudRecords.length} records from Cloud.`);
    } catch (e) {
        console.error('Fetch failed:', e.message);
        process.exit(1);
    }

    // 2. Mock Existing DB Records
    // Let's take the first record from cloud and modify it to simulate an update needed
    const mockExisting = [];
    if (cloudRecords.length > 0) {
        const original = cloudRecords[0];
        // Create a copy with stale data
        const stale = { ...original, Income: '$0.00' }; // Assume cloud has real value
        mockExisting.push(stale);

        console.log('Mocking existing record (Stale):', stale.Name, 'Income:', stale.Income);
        console.log('Cloud record (Fresh):', original.Name, 'Income:', original.Income);
    }

    // 3. Merging
    console.log('Running Merge Engine...');
    const result = mergeRecords(mockExisting, cloudRecords);

    // 4. Verification
    console.log(`Merge Result: ${result.merged.length} records.`);

    // Check if the stale record was updated
    const updated = result.merged.find(r => r.Name === mockExisting[0].Name && r['Candidate Committee'] === mockExisting[0]['Candidate Committee']);
    if (updated && updated.Income === cloudRecords[0].Income) {
        console.log('✅ SUCCESS: Record updated with fresh data from Cloud.');
    } else {
        console.log('❌ FAILURE: Record not updated correctly.');
        console.log('Updated State:', updated ? updated.Income : 'Not Found');
    }

    console.log('--- Verification Complete ---');
})();
