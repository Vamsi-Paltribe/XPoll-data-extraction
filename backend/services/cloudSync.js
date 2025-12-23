const axios = require('axios');
const { parse } = require('csv-parse/sync');

const fetchAndParseSheet = async (url) => {
    try {
        const response = await axios.get(url);
        const data = response.data;

        const records = parse(data, {
            columns: true,
            skip_empty_lines: true
        });

        return records;
    } catch (error) {
        console.error("Error fetching or parsing sheet:", error.message);
        throw error;
    }
};

const filterRecords = (records, filters) => {
    // prompts says: "States: Multi-select dropdown... Only records matching these filters are pulled"
    // We need to identify which column is State/City.
    // Based on the chunk read earlier: "State Representative - District 1", or "State Treasurer".
    // Wait, the CSV has "Office" which might contain "State ...".
    // It doesn't seem to have a dedicated "State" column. 
    // BUT the prompt says: "State/City Logic: Inside a bucket, provide a UI for multi-selecting USA States and Cities."
    // And "Action: Only records matching these filters are pulled".
    // I will assume likely columns "State", "City" or we scan "Office" / "Committee" address (not visible in simple CSV usually).
    // Let's assume for this MVP that the CSV *has* a "State" column or we check if "Office" contains the state code/name if provided.
    // Actually, looking at the chunk: "Zalecki, Sandy... State Representative - District 1".
    // I don't see "AZ" or "Arizona" clearly in a separate column in the first chunk, but "Winchester for Arizona".

    // FOR MVP: We will assume we filter by a mock "State" property if it exists, OR we just return all if column missing.
    // Real implementation would require column mapping.

    if (!filters || (!filters.states.length && !filters.cities.length)) return records;

    return records.filter(rec => {
        // Mock logic: Check if any value in the record contains the State string
        // This is fuzzy but works for "Arizona" in "Office" column.
        let matchState = true;
        if (filters.states && filters.states.length > 0) {
            matchState = filters.states.some(state =>
                Object.values(rec).some(val => String(val).includes(state))
            );
        }

        // Similar for City
        let matchCity = true;
        if (filters.cities && filters.cities.length > 0) {
            matchCity = filters.cities.some(city =>
                Object.values(rec).some(val => String(val).includes(city))
            );
        }

        return matchState && matchCity;
    });
};

const mergeRecords = (existingRecords, cloudRecords) => {
    // Unified Logic: 
    // 1. Identify records by Key (Name + Committee) -- Prompt: "Name and Candidate Committee as a composite key"
    // 2. If New -> Add to 'records' with status 'pending' (Processed Tab).
    // 3. If Exists -> Compare. 
    //    - If Identity matches but data differs -> Flag 'conflict'. Status 'conflict'.
    //    - If Identity matches and data same -> No action (or update timestamp).

    const processed = [];
    const usedKeys = new Set();

    // Map existing for fast lookup
    const existingMap = new Map();
    existingRecords.forEach(rec => {
        const key = `${rec.data.Name}|${rec.data['Candidate Committee']}`;
        existingMap.set(key, rec);
    });

    cloudRecords.forEach(cloudRec => {
        const key = `${cloudRec.Name}|${cloudRec['Candidate Committee']}`;
        usedKeys.add(key);

        const existing = existingMap.get(key);

        if (existing) {
            // Compare Data
            const dataChanged = JSON.stringify(existing.data) !== JSON.stringify(cloudRec); // Simple comparison

            if (dataChanged) {
                // Update existing record to conflict
                existing.status = 'conflict';
                // We store the "new" conflicting data somewhere? 
                // The prompt says "Provide a side-by-side comparison".
                // We'll store the *cloud* data in `data` temporarily or a special field?
                // Actually, let's keep `data` as the "Current" (DB) value.
                // We need a place to store the "Incoming" value for the conflict UI.
                // Let's add it to a temporary field in existing record or history?
                // We'll add a temporary property 'incomingData' to the object we return to frontend/DB?
                // Mongoose Mixed allows arbitrary fields.

                existing.incomingData = cloudRec; // We'll save this to DB ? Schema needs to permit it. Mixed 'data' is strictly for the content.
                // Wait, BucketSchema records is [RecordSchema]. 
                // We should add `incomingData` to RecordSchema. I'll update model.

                processed.push(existing);
            } else {
                // No change, keep as is
                processed.push(existing);
            }
        } else {
            // New Record
            processed.push({
                data: cloudRec,
                status: 'pending',
                history: [{ action: 'sync', timestamp: new Date() }]
            });
        }
    });

    // Keep records that are in DB but not in Cloud?
    existingRecords.forEach(rec => {
        const key = `${rec.data.Name}|${rec.data['Candidate Committee']}`;
        if (!usedKeys.has(key)) {
            processed.push(rec);
        }
    });

    return processed;
};

module.exports = {
    fetchAndParseSheet,
    filterRecords,
    mergeRecords
};
