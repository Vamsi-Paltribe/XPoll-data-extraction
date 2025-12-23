const { GoogleGenerativeAI } = require("@google/generative-ai");
const pdfParse = require('pdf-parse');

/**
 * Process PDF with Gemini Flash 2.0
 * Extracts voter data and organizes by state
 * @param {Buffer} pdfBuffer - PDF file buffer
 * @returns {Promise<Object>} - { "StateName": [{Name, City, Age, ...}], ... }
 */
async function processPdfWithGemini(pdfBuffer) {
    try {
        // 1. Extract text from PDF
        console.log('[Gemini] Parsing PDF...');
        const pdfData = await pdfParse(pdfBuffer);
        const text = pdfData.text;

        if (!text || text.trim().length === 0) {
            throw new Error('PDF appears to be empty or contains no extractable text');
        }

        console.log(`[Gemini] Extracted ${text.length} characters from PDF`);

        // 2. Initialize Gemini
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({
            model: "gemini-2.0-flash-exp",
            generationConfig: {
                responseMimeType: "application/json",
                temperature: 0.1 // Low temperature for consistent extraction
            }
        });

        // 3. Create extraction prompt
        const prompt = `
You are a data extraction assistant for voter registration records.

TASK: Extract ALL voter/candidate information from the provided document and organize by STATE.

REQUIRED OUTPUT FORMAT (JSON):
{
  "StateName": [
    {
      "Name": "Full Name",
      "City": "City Name",
      "Age": number or null,
      "Address": "Full Address" or null,
      "Phone": "Phone Number" or null,
      "Email": "Email" or null
    }
  ]
}

RULES:
1. Group all records by their STATE (use state name as key, e.g., "Georgia", "Florida")
2. If state is not explicitly mentioned, try to infer from city names or context
3. Extract ALL available fields for each person
4. If a field is not available, use null
5. Ensure Name and City are always present (skip records without these)
6. Use proper capitalization for state names (e.g., "Georgia" not "GEORGIA")
7. If you find multiple formats or tables, extract all of them

DOCUMENT TEXT:
${text}
`;

        // 4. Call Gemini API
        console.log('[Gemini] Sending to Gemini Flash 2.0...');
        const result = await model.generateContent(prompt);
        const responseText = result.response.text();

        console.log('[Gemini] Response received');

        // 5. Parse JSON response
        const extractedData = JSON.parse(responseText);

        // 6. Validate structure
        if (typeof extractedData !== 'object' || Object.keys(extractedData).length === 0) {
            throw new Error('Gemini returned invalid data structure');
        }

        // 7. Count total records
        const totalRecords = Object.values(extractedData).reduce((sum, records) => sum + records.length, 0);
        console.log(`[Gemini] Extracted ${totalRecords} records across ${Object.keys(extractedData).length} state(s)`);

        return extractedData;

    } catch (error) {
        console.error('[Gemini] Processing failed:', error.message);
        throw new Error(`PDF processing failed: ${error.message}`);
    }
}

module.exports = {
    processPdfWithGemini
};
