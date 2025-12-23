const OpenAI = require('openai');
const xlsx = require('xlsx');
const mammoth = require('mammoth');
const pdfParse = require('pdf-parse');

async function processDocumentWithOpenAI(fileBuffer, mimeType) {
    try {
        const openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY
        });

        // Check if it's an image
        const isImage = mimeType.startsWith('image/');

        if (isImage) {
            // Process image with vision
            console.log('[OpenAI] Processing image with GPT-4o Vision...');

            const base64Image = fileBuffer.toString('base64');
            const imageUrl = `data:${mimeType};base64,${base64Image}`;

            const completion = await openai.chat.completions.create({
                model: "gpt-4o-mini",
                messages: [
                    {
                        role: "system",
                        content: "You are a precise data extraction assistant. Always return valid JSON."
                    },
                    {
                        role: "user",
                        content: [
                            {
                                type: "text",
                                text: `Extract ALL voter/candidate registration data from this image and organize by STATE.

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
1. Group all records by their STATE (use state name as key)
2. If state is not explicitly mentioned, try to infer from city names or context
3. Extract ALL available fields for each person
4. Use null for missing fields
5. Ensure Name is always present (skip records without Name)
6. Be flexible with column names and table structures
7. Extract from all tables and formats found in the image

Return ONLY the JSON object, no markdown formatting.`
                            },
                            {
                                type: "image_url",
                                image_url: {
                                    url: imageUrl
                                }
                            }
                        ]
                    }
                ],
                response_format: { type: "json_object" },
                temperature: 0.1,
                max_tokens: 4096
            });

            const extractedData = JSON.parse(completion.choices[0].message.content);

            if (typeof extractedData !== 'object' || Object.keys(extractedData).length === 0) {
                throw new Error('OpenAI returned invalid data structure');
            }

            const totalRecords = Object.values(extractedData).reduce((sum, records) => sum + records.length, 0);
            console.log(`[OpenAI] Extracted ${totalRecords} records from image`);

            return extractedData;
        }

        // Step 1: Extract text based on file type (for non-images)
        console.log('[OpenAI] Extracting text from document...');
        let extractedText = '';

        if (mimeType === 'application/pdf') {
            const pdfData = await pdfParse(fileBuffer);
            extractedText = pdfData.text;
        }
        else if (mimeType.includes('spreadsheet') || mimeType.includes('excel')) {
            const workbook = xlsx.read(fileBuffer, { type: 'buffer' });
            const sheets = [];
            workbook.SheetNames.forEach(sheetName => {
                const worksheet = workbook.Sheets[sheetName];
                const data = xlsx.utils.sheet_to_json(worksheet, { header: 1 });
                sheets.push(`Sheet: ${sheetName}\n${data.map(row => row.join('\t')).join('\n')}`);
            });
            extractedText = sheets.join('\n\n');
        }
        else if (mimeType.includes('wordprocessingml')) {
            const result = await mammoth.extractRawText({ buffer: fileBuffer });
            extractedText = result.value;
        }
        else if (mimeType === 'text/csv') {
            extractedText = fileBuffer.toString('utf-8');
        }
        else {
            throw new Error(`Unsupported file type: ${mimeType}`);
        }

        if (!extractedText || extractedText.trim().length === 0) {
            throw new Error('Document appears to be empty or contains no extractable text');
        }

        console.log(`[OpenAI] Extracted ${extractedText.length} characters`);

        // Step 2: Create extraction prompt
        const prompt = `You are a data extraction assistant for voter/candidate registration records.

TASK: Extract ALL voter/candidate information from the provided document and organize by STATE.

IMPORTANT: The document format may vary. Be flexible with column names and data structures.

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
4. Use null for missing fields
5. Ensure Name is always present (skip records without Name)
6. Use proper capitalization for state names (e.g., "Georgia" not "GEORGIA")
7. Be flexible with column names - they might vary (e.g., "Full Name" vs "Name", "Phone Number" vs "Contact")
8. Extract from all tables, lists, and formats found in the document

DOCUMENT TEXT:
${extractedText}

Return ONLY the JSON object, no markdown formatting.`;

        // Step 3: Call OpenAI API
        console.log('[OpenAI] Sending to GPT-4o-mini...');
        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                {
                    role: "system",
                    content: "You are a precise data extraction assistant. Always return valid JSON."
                },
                {
                    role: "user",
                    content: prompt
                }
            ],
            response_format: { type: "json_object" },
            temperature: 0.1
        });

        const responseText = completion.choices[0].message.content;
        console.log('[OpenAI] Response received');

        // Step 4: Parse and validate JSON
        const extractedData = JSON.parse(responseText);

        if (typeof extractedData !== 'object' || Object.keys(extractedData).length === 0) {
            throw new Error('OpenAI returned invalid data structure');
        }

        const totalRecords = Object.values(extractedData).reduce((sum, records) => sum + records.length, 0);
        console.log(`[OpenAI] Extracted ${totalRecords} records across ${Object.keys(extractedData).length} state(s)`);

        return extractedData;

    } catch (error) {
        console.error('[OpenAI] Processing failed:', error.message);
        throw new Error(`Document processing failed: ${error.message}`);
    }
}

module.exports = { processDocumentWithOpenAI };
