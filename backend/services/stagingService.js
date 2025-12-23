const axios = require('axios');
const { parse } = require('csv-parse/sync');
const CustomerRecord = require('../models/CustomerRecord');
const StagingRecord = require('../models/StagingRecord');
const SyncBatch = require('../models/SyncBatch');

const stateMap = {
    'AL': 'Alabama', 'AK': 'Alaska', 'AZ': 'Arizona', 'AR': 'Arkansas', 'CA': 'California',
    'CO': 'Colorado', 'CT': 'Connecticut', 'DE': 'Delaware', 'FL': 'Florida', 'GA': 'Georgia',
    'HI': 'Hawaii', 'ID': 'Idaho', 'IL': 'Illinois', 'IN': 'Indiana', 'IA': 'Iowa',
    'KS': 'Kansas', 'KY': 'Kentucky', 'LA': 'Louisiana', 'ME': 'Maine', 'MD': 'Maryland',
    'MA': 'Massachusetts', 'MI': 'Michigan', 'MN': 'Minnesota', 'MS': 'Mississippi', 'MO': 'Missouri',
    'MT': 'Montana', 'NE': 'Nebraska', 'NV': 'Nevada', 'NH': 'New Hampshire', 'NJ': 'New Jersey',
    'NM': 'New Mexico', 'NY': 'New York', 'NC': 'North Carolina', 'ND': 'North Dakota', 'OH': 'Ohio',
    'OK': 'Oklahoma', 'OR': 'Oregon', 'PA': 'Pennsylvania', 'RI': 'Rhode Island', 'SC': 'South Carolina',
    'SD': 'South Dakota', 'TN': 'Tennessee', 'TX': 'Texas', 'UT': 'Utah', 'VT': 'Vermont',
    'VA': 'Virginia', 'WA': 'Washington', 'WV': 'West Virginia', 'WI': 'Wisconsin', 'WY': 'Wyoming'
};

/**
 * Extracts the Spreadsheet ID from a Google Sheets URL
 */
const extractSpreadsheetId = (url) => {
    const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    return match ? match[1] : null;
};

/**
 * Scrapes the spreadsheet HTML to find all sheet names and GIDs
 */
const fetchSheetList = async (spreadsheetId) => {
    try {
        const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;
        const response = await axios.get(url);
        const html = response.data;

        // Google Sheets embeds sheet data in a JSON-like structure in the HTML
        const sheetDataMatch = html.match(/bootstrapData\s*=\s*({.+?});/);
        const dataStr = sheetDataMatch[1];
        const data = JSON.parse(dataStr);

        let sheets = [];

        // Strategy 1: Standard paths
        const changes = data.changes?.v || (data.v && data.v.changes?.v);
        if (changes && Array.isArray(changes)) {
            sheets = changes.map(s => ({ gid: s[0].toString(), name: s[1] }));
        }
        // Strategy 2: Search in topsnapshot
        else if (data.changes?.topsnapshot) {
            data.changes.topsnapshot.forEach(shot => {
                const s = shot[2];
                if (typeof s === 'string' && s.includes('[')) {
                    // Try to extract from stringified JSON in shot
                    const match = s.match(/\[\d+,\d+,"([^"]+)",\[{"1":\[\[\d+,\d+,"([^"]+)"/);
                    if (match) sheets.push({ gid: match[1], name: match[2] });
                }
            });
        }

        // Strategy 3: Regex fallback on the raw string (very robust)
        if (sheets.length === 0) {
            // Look for patterns like [0,0,"<gid>",[{"1":[[0,0,"<name>"]]
            // Handle both \" and " depending on how JSON was parsed/extracted
            const regex = /\[0,0,["\\]+([\w-]+)["\\]+,\[\{["\\]+1["\\]+:\[\[0,0,["\\]+([^"\\]+)["\\]+/g;
            let m;
            while ((m = regex.exec(dataStr)) !== null) {
                sheets.push({ gid: m[1], name: m[2] });
            }
        }

        // Remove duplicates and filter out noise
        sheets = sheets.filter((s, index, self) =>
            s.name && s.gid && self.findIndex(t => t.gid === s.gid) === index
        );

        return sheets.length > 0 ? sheets : [{ gid: '0', name: 'Sheet1' }];
    } catch (error) {
        console.error("Error fetching sheet list:", error.message);
        return [{ gid: '0', name: 'Sheet1' }];
    }
};

const fetchAndParseSheet = async (url, options = {}) => {
    try {
        const spreadsheetId = extractSpreadsheetId(url);
        const { targetSheets, limitRows } = options;
        if (!spreadsheetId) {
            const response = await axios.get(url);
            return parse(response.data, { columns: true, skip_empty_lines: true });
        }

        const allSheets = await fetchSheetList(spreadsheetId);
        let sheetsToProcess = allSheets;

        if (targetSheets && targetSheets.length > 0) {
            // Case-insensitive matching for sheet names
            // Expand state codes (e.g., "NY") to full names (e.g., "New York") for better matching
            const targets = targetSheets.flatMap(s => {
                const code = s.toUpperCase();
                const name = stateMap[code];
                return name ? [code.toLowerCase(), name.toLowerCase()] : [s.toLowerCase()];
            });

            sheetsToProcess = allSheets.filter(s =>
                targets.some(t => s.name.toLowerCase().includes(t))
            );

            // If target sheets were specified but none found, return empty rather than falling back
            if (sheetsToProcess.length === 0) {
                return [];
            }
        }

        let allRecords = [];

        for (const sheet of sheetsToProcess) {
            console.log(`[Sync] Fetching sheet: ${sheet.name} (GID: ${sheet.gid})`);
            const csvUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv&gid=${sheet.gid}`;
            const response = await axios.get(csvUrl);

            // If we only need headers or a few rows for preview
            const parseOptions = { columns: true, skip_empty_lines: true };
            if (limitRows) {
                // Not strictly supported by csv-parse/sync easily with a simple flag for all formats, 
                // but we can parse a chunk if needed. For now, we'll parse all and slice or just return if it's small.
            }

            const records = parse(response.data, parseOptions);

            // Add metadata to each record
            records.forEach(r => {
                r._sheetName = sheet.name;
            });

            allRecords = allRecords.concat(records);

            if (limitRows && allRecords.length >= limitRows) break;
        }
        return allRecords;
    } catch (error) {
        console.error("Error fetching or parsing sheets:", error.message);
        throw error;
    }
};

const fetchHeaders = async (url, filters = {}) => {
    // 1. Fetch sheet list
    const spreadsheetId = extractSpreadsheetId(url);
    if (!spreadsheetId) return [];

    const sheets = await fetchSheetList(spreadsheetId);

    // 2. Identify target sheets based on state filters
    let targets = [];
    if (filters.states && filters.states.length > 0) {
        targets = filters.states;
    }

    // 3. Fetch first row from matching sheets to get headers
    const records = await fetchAndParseSheet(url, { targetSheets: targets, limitRows: 1 });
    if (records.length === 0) return [];

    // 4. Extract unique keys, excluding internal ones
    const keys = new Set();
    records.forEach(r => {
        Object.keys(r).forEach(k => {
            if (!k.startsWith('_')) keys.add(k);
        });
    });

    return Array.from(keys);
};

const syncToStaging = async (bucketId, cloudRecords, filters) => {
    // 1. Cleanup old pending batches/records
    const pendingBatches = await SyncBatch.find({ bucketId, status: 'pending' });
    const pendingBatchIds = pendingBatches.map(b => b._id);
    await StagingRecord.deleteMany({ batchId: { $in: pendingBatchIds } });
    await SyncBatch.deleteMany({ _id: { $in: pendingBatchIds } });

    // 2. Create New Batch
    const newBatch = new SyncBatch({
        bucketId,
        filters,
        status: 'pending'
    });
    await newBatch.save();

    // 3. Filter Records
    let filtered = cloudRecords;
    console.log(`[Sync] Total records fetched from all sheets: ${cloudRecords.length}`);

    if (filters && (filters.states?.length || filters.cities?.length)) {
        filtered = cloudRecords.filter(rec => {
            let stateMatch = true;
            let cityMatch = true;

            // Priority check: If the sheet name matches a state, we trust it highly
            const sheetName = (rec._sheetName || '').toLowerCase();

            if (filters.states?.length) {
                stateMatch = filters.states.some(code => {
                    const name = (stateMap[code] || code).toLowerCase();
                    const stateCode = code.toLowerCase();

                    // Check sheet name first
                    if (sheetName.includes(stateCode) || sheetName.includes(name)) return true;

                    // Check row content
                    const rowStr = JSON.stringify(rec).toLowerCase();
                    return rowStr.includes(stateCode) || rowStr.includes(name);
                });
            }

            if (filters.cities?.length) {
                cityMatch = filters.cities.some(c => {
                    const cityKeyword = c.toLowerCase().trim();
                    if (!cityKeyword) return false;

                    // 1. Check common city fields specifically first (substring match)
                    const cityVal = (rec.City || rec.CITY || rec.city || rec.Town || '').toLowerCase().trim();
                    if (cityVal.includes(cityKeyword)) return true;

                    // 2. Check for the keyword as a whole word in any other field
                    const rowStr = JSON.stringify(rec).toLowerCase();
                    const wordRegex = new RegExp(`\\b${cityKeyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
                    if (wordRegex.test(rowStr)) return true;

                    // 3. Last fallback: simple substring check on the whole row
                    return rowStr.includes(cityKeyword);
                });
            }

            return stateMatch && cityMatch;
        });
        console.log(`[Sync] Filtered to ${filtered.length} records`);
    }

    // 3.5 Apply Column Selection if provided
    if (filters && filters.selectedHeaders && filters.selectedHeaders.length > 0) {
        const headers = filters.selectedHeaders;
        filtered = filtered.map(rec => {
            const filteredRec = {};
            headers.forEach(h => {
                if (rec.hasOwnProperty(h)) filteredRec[h] = rec[h];
            });
            // Keep internal metadata
            filteredRec._sheetName = rec._sheetName;
            return filteredRec;
        });
    }

    // 4. Prepare Staging Records
    const batchData = [];
    const customerRecordsMap = new Map();
    const existing = await CustomerRecord.find({ bucketId });
    existing.forEach(r => customerRecordsMap.set(r.keyHash, r.data));

    let conflictCount = 0;

    for (const rec of filtered) {
        // More robust extraction of State, City, and Name
        const state = (rec.State || rec.STATE || rec.state || rec.Province || '').toLowerCase().trim();
        const city = (rec.City || rec.CITY || rec.city || rec.Town || '').toLowerCase().trim();

        // Handling "Candidate" or "Candidate Name" as synonms for "Name"
        const name = (rec.Name || rec.NAME || rec.name || rec.Candidate || rec['Candidate Name'] || '').toLowerCase().trim();

        // New keyHash logic: [State]|[City]|[Name]
        const keyHash = `${state}|${city}|${name}`;

        let status = 'pending';
        let conflictData = null;

        if (customerRecordsMap.has(keyHash)) {
            const existingData = customerRecordsMap.get(keyHash);

            // Compare data (excluding our internal _sheetName)
            const recClean = { ...rec };
            delete recClean._sheetName;

            const existingClean = { ...existingData };
            delete existingClean._sheetName;

            if (JSON.stringify(existingClean) !== JSON.stringify(recClean)) {
                status = 'conflict';
                conflictCount++;
                conflictData = existingData;
            } else {
                continue; // Skip exact matches
            }
        }

        batchData.push({
            bucketId,
            batchId: newBatch._id,
            data: rec,
            keyHash,
            status,
            conflictData
        });
    }

    // 5. Insert
    if (batchData.length > 0) {
        await StagingRecord.insertMany(batchData);
    }

    // 6. Update Batch Stats
    newBatch.recordCount = batchData.length;
    newBatch.conflictCount = conflictCount;
    await newBatch.save();

    return { batchId: newBatch._id, count: batchData.length, conflicts: conflictCount };
};

module.exports = { syncToStaging, fetchAndParseSheet, extractSpreadsheetId, fetchSheetList, fetchHeaders };
