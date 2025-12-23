const { GoogleGenerativeAI } = require("@google/generative-ai");

async function processPdfWithGemini(pdfBuffer) {
    try {
        // 1. Prepare PDF for multimodal input
        console.log('[Gemini] Encoding PDF to Base64...');
        const pdfPart = {
            inlineData: {
                data: pdfBuffer.toString("base64"),
                mimeType: "application/pdf"
            }
        };

        // 2. Initialize Gemini Pro Vision (Supports multimodal PDF input)
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({
            model: "gemini-2.0-flash",
            generationConfig: {
                temperature: 0.1
            }
        });

        // 3. Create extraction prompt (Optimized for Multimodal)
        const prompt = `
You are a data extraction assistant for voter registration records.
TASK: Extract ALL voter/candidate information from the ATTACHED PDF and organize by STATE.

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
1. Group records by STATE.
2. Infer state from context if not explicit.
3. Use null for missing fields.
4. Skip records missing Name or City.
5. Extract from all tables and formats found in the document.
`;

        // 4. Call Gemini API with both Prompt and PDF
        console.log('[Gemini] Sending to Gemini Flash 2.0 (Multimodal)...');
        const result = await model.generateContent([prompt, pdfPart]);
        let responseText = result.response.text();

        // 5. Clean & Parse JSON
        // Strip markdown backticks if they exist
        const cleanedJson = responseText.replace(/```json|```/g, "").trim();
        const extractedData = JSON.parse(cleanedJson);

        // 6. Validation
        if (typeof extractedData !== 'object') {
            throw new Error('Gemini returned invalid data structure');
        }

        const totalRecords = Object.values(extractedData).reduce((sum, records) => sum + records.length, 0);
        console.log(`[Gemini] Success: Extracted ${totalRecords} records.`);

        return extractedData;

    } catch (error) {
        console.error('[Gemini] Processing failed:', error.message);
        throw new Error(`PDF processing failed: ${error.message}`);
    }
}

module.exports = { processPdfWithGemini };