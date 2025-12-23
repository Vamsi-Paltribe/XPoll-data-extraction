const { google } = require('googleapis');
const path = require('path');

const SHEET_ID = '1wCsebIUQi_YZgYCAsfQyAvyRm3cS2r3OaiDvpkZ8Vyo';

/**
 * Get authenticated Google Sheets client
 */
async function getAuthClient() {
    // Using service account authentication
    const auth = new google.auth.GoogleAuth({
        keyFile: process.env.GOOGLE_SERVICE_ACCOUNT_KEY || path.join(__dirname, '../google-credentials.json'),
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    return await auth.getClient();
}

/**
 * Append data to a state-specific tab in Google Sheets
 * Creates tab if it doesn't exist
 * Aligns data with existing headers
 * @param {string} stateName - Name of the state (tab name)
 * @param {Array<Object>} records - Array of voter records
 */
async function appendToStateTab(stateName, records) {
    try {
        if (!records || records.length === 0) {
            console.log(`[Sheets] No records to append for ${stateName}`);
            return;
        }

        console.log(`[Sheets] Processing ${records.length} records for state: ${stateName}`);

        const auth = await getAuthClient();
        const sheets = google.sheets({ version: 'v4', auth });

        // 1. Get sheet metadata to check if tab exists
        const sheetMetadata = await sheets.spreadsheets.get({
            spreadsheetId: SHEET_ID
        });

        const existingTab = sheetMetadata.data.sheets.find(
            s => s.properties.title.toLowerCase() === stateName.toLowerCase()
        );

        let headers;

        if (!existingTab) {
            // 2. Create new tab for this state
            console.log(`[Sheets] Creating new tab: ${stateName}`);
            await sheets.spreadsheets.batchUpdate({
                spreadsheetId: SHEET_ID,
                resource: {
                    requests: [{
                        addSheet: {
                            properties: {
                                title: stateName,
                                gridProperties: {
                                    frozenRowCount: 1 // Freeze header row
                                }
                            }
                        }
                    }]
                }
            });

            // 3. Add headers (first row) - use keys from first record
            headers = Object.keys(records[0]);
            await sheets.spreadsheets.values.update({
                spreadsheetId: SHEET_ID,
                range: `${stateName}!A1`,
                valueInputOption: 'RAW',
                resource: { values: [headers] }
            });

            console.log(`[Sheets] Added headers: ${headers.join(', ')}`);
        } else {
            // 4. Get existing headers from tab
            const headerResponse = await sheets.spreadsheets.values.get({
                spreadsheetId: SHEET_ID,
                range: `${stateName}!1:1`
            });

            headers = headerResponse.data.values ? headerResponse.data.values[0] : Object.keys(records[0]);
            console.log(`[Sheets] Using existing headers: ${headers.join(', ')}`);
        }

        // 5. Map records to match header order (align columns)
        const rows = records.map(record =>
            headers.map(header => {
                const value = record[header];
                // Convert null/undefined to empty string
                return value !== null && value !== undefined ? String(value) : '';
            })
        );

        // 6. Append data rows
        const appendResponse = await sheets.spreadsheets.values.append({
            spreadsheetId: SHEET_ID,
            range: `${stateName}!A2`,
            valueInputOption: 'RAW',
            insertDataOption: 'INSERT_ROWS',
            resource: { values: rows }
        });

        console.log(`[Sheets] Successfully appended ${rows.length} rows to ${stateName}`);
        return appendResponse.data;

    } catch (error) {
        console.error(`[Sheets] Error appending to ${stateName}:`, error.message);
        throw new Error(`Failed to update Google Sheet for ${stateName}: ${error.message}`);
    }
}

/**
 * Process all extracted data and update Google Sheets
 * @param {Object} extractedData - { "StateName": [records], ... }
 * @returns {Promise<Object>} - Summary of updates
 */
async function updateGoogleSheets(extractedData) {
    const summary = {
        totalStates: 0,
        totalRecords: 0,
        states: []
    };

    for (const [stateName, records] of Object.entries(extractedData)) {
        await appendToStateTab(stateName, records);
        summary.totalStates++;
        summary.totalRecords += records.length;
        summary.states.push({
            name: stateName,
            recordCount: records.length
        });
    }

    return summary;
}

module.exports = {
    appendToStateTab,
    updateGoogleSheets
};
