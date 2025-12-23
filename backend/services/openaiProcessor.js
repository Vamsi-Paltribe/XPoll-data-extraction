const OpenAI = require('openai');

/**
 * @param {Object} fileData - The JSON object sent from the frontend
 * @param {string} fileName - Original file name
 */
async function processDocumentWithOpenAI(fileData, fileName) {
    try {
        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

        const MASTER_JSON_STRUCTURE = {
            "StateName": [
                {
                    "Name": "Full Name",
                    "City": "City Name",
                    "State": "State",
                    "Zip": "Zip Code",
                    "Address": "Full Street Address",
                    "Phone": "Phone Number",
                    "Email": "Email Address",
                    "Type": "Contribution or Expenditure",
                    "Amount": "Numerical Amount",
                    "Date": "YYYY-MM-DD",
                    "Employer": "Employer Name if available"
                }
            ]
        };

        const EXTRACTION_RULES = `
1. Group records by STATE (e.g., "Rhode Island", "Georgia"). 
2. Field Mapping: 
   - 'Name' is mandatory. Skip records where a name cannot be found.
   - 'Type': Identify if 'Contribution' (in) or 'Expenditure' (out).
3. Amounts: Extract numerical values only (e.g., 235.45).
4. Formatting: Return ONLY a valid JSON object.`;

        let textToProcess = "";

        if (fileData.type === 'structured') {
            textToProcess = JSON.stringify(fileData.content);
        } else if (fileData.type === 'pdf_text' || fileData.type === 'text') {
            textToProcess = fileData.content;
        }

        const prompt = `
TASK: Extract electoral data from the provided content into JSON.
FILENAME: ${fileName}
JSON STRUCTURE: ${JSON.stringify(MASTER_JSON_STRUCTURE)}
RULES: ${EXTRACTION_RULES}

CONTENT TO PROCESS:
${textToProcess}`;

        console.log(`[OpenAI] Processing ${fileData.type} content for: ${fileName}`);

        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                { role: "system", content: "You are a precise data extraction assistant specializing in electoral campaign finance." },
                { role: "user", content: prompt }
            ],
            response_format: { type: "json_object" },
            temperature: 0.1
        });

        return JSON.parse(completion.choices[0].message.content);

    } catch (error) {
        console.error('[OpenAI] Failed:', error.message);
        throw error;
    }
}

module.exports = { processDocumentWithOpenAI };