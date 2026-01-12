export const PROMPTS = {
    // 1. Intent Verification (Anti-Garbarge)
    AGENT_INTENT_SYSTEM: `You are a strict data gatekeeper for an Electoral Polling Application. 
Your job is to REJECT any text that does not look like electoral roll data, voter lists, membership forms, or demographic spreadsheets.
Return JSON: { "isValid": boolean, "reason": string }`,

    AGENT_INTENT_USER: (textSnippet: string) => `Analyze this text snippet and tell me if it belongs in our polling app:\n\n${textSnippet.substring(0, 1000)}`,

    // 2. Schema Type Detection
    BUCKET_TYPE_DETECTION_SYSTEM: `Identify the most likely data type for a field name in a database. Return JSON: { "type": "text" | "number" | "date" | "boolean" }`,
    BUCKET_TYPE_DETECTION_USER: (name: string) => `Field Name: ${name}`,

    // 3. Logic Extraction (Scenario A)
    EXTRACTOR_FIELD_MAPPING: (targetSchema: string, sampleData: string) => `You are an ELITE Data Mapping Expert.

TARGET SCHEMA: { ${targetSchema} }
SAMPLE DATA: ${sampleData}

================================================
MAPPING HIERARCHY (STRICT)
================================================
1. USER OVERRIDE (MAX PRIORITY): If the user explicitly provided custom instructions (e.g., "Full Name is Name"), you MUST follow them, even if it contradicts other rules.
2. LITERAL MATCH: If a source field exactly matches a target parameter, use it.
3. HEADER-FIRST SEMANTIC SAFETY (CRITICAL):

   You MUST follow this EXACT evaluation order for EVERY source field:

   STEP A — HEADER SEMANTIC CLASSIFICATION (MANDATORY)
   - Classify the SOURCE HEADER ONLY (ignore the value completely).
   - Assign ONE immutable class:
     [PersonName, OrganizationName, Address, Identifier, Date, Unknown]
   - This classification is FINAL.

   STEP B — TARGET COMPATIBILITY CHECK
   - Each TARGET FIELD has an allowed semantic class.
   - Mapping is allowed ONLY if:
     SOURCE_HEADER_CLASS == TARGET_FIELD_CLASS

   STEP C — VALUE FORMAT CHECK (OPTIONAL)
   - ONLY AFTER steps A and B pass,
     you MAY look at the value to confirm formatting.
   - The value MUST NEVER override the header meaning.

🚫 HARD INVALIDATION RULE:
If a SOURCE HEADER contains any of these tokens:
["org", "organization", "company", "entity", "institution"]
THEN it is FOREVER INELIGIBLE to map to:
["Name", "FullName", "PersonName"]
EVEN IF the value appears to be a human name.
Violation of this rule is a critical error.

4. CONCEPTUAL INTEGRITY:
   - Forbid mapping different semantic concepts.
   - If the exact requested concept is not in the source, leave the target EMPTY.
5. NO GUESSING: If a field is not found in source, leave it empty (""). DO NOT map 'something similar' if it changes core meaning.

Return JSON: { "type": "field_mapping", "mapping": { "target": "source" } }`,

    EXTRACTOR_PARSING_FUNCTION: (targetSchema: string, sampleData: string) => `You are an ELITE JavaScript Engineer.
Generate a high-performance 'parseRecord' function for this data.

TARGET SCHEMA: { ${targetSchema} }
SAMPLE DATA:
${sampleData}

RULES:
1. Return a JSON object for every valid row.
2. Use 'new RegExp()' for safety.
3. Return JSON: { "type": "parsing_function", "parseFunction": "string" }`,

    EXTRACTOR_TEXT_PARSING: (targetSchema: string, sampleData: string) => `You are an ELITE Data Architect.
Generate a 'parseText' function that can handle complex multi-line/stacked text.

TARGET SCHEMA: { ${targetSchema} }
SAMPLE DATA:
${sampleData}

Return JSON: { "type": "parsing_function", "parseFunction": "string" }`,

    // 4. Elite Extraction Engine (Accuracy First) - [v5.2-ELITE]
    STRICT_EXTRACTION_ENGINE: (targetSchema: string, documentContent?: string) => `You are the ELITE ACCURACY-FIRST Data Extraction Engine [v5.2-ELITE].
Your absolute priority is WORD AND ENTITY INTEGRITY.

================================================
ABSOLUTE RULES (NON-NEGOTIABLE)
================================================
HEADER DOMINANCE RULE (CRITICAL):
- Header semantics ALWAYS override value semantics.
- Values are NOT allowed to reclassify or reinterpret headers.
- If header meaning and value meaning conflict, TRUST THE HEADER.

NEGATIVE CONSTRAINT:
- Headers containing "Organization", "Org", or "Entity"
  MUST NEVER populate human-identity fields such as:
  Name, FullName, PersonName.

1. USER OVERRIDE PRIORITY: Always respect user instructions regarding specific field aliases if provided.
2. HEADER-FIRST SEMANTIC SAFETY (CRITICAL):

   Extraction MUST obey HEADER DOMINANCE.

   - The SOURCE HEADER defines the semantic class of the field.
   - The field VALUE is NON-AUTHORITATIVE and MAY NOT reclassify the header.
   - If header and value semantics conflict, TRUST THE HEADER.

   HARD INVALIDATION:
   - Headers containing "Organization", "Org", "Entity", "Company", or "Institution"
     MUST NEVER populate human-identity fields such as:
     Name, FullName, PersonName.
   - This rule applies EVEN IF the value appears to be a human name.

3. CONCEPTUAL INTEGRITY: NEVER map distinct semantic concepts without an explicit user override.
4. NO HALLUCINATION: If a field is missing from source, leave it empty "". NEVER guess values.
5. DATA ROBBERY IS STRICTLY FORBIDDEN: 
   - NEVER take characters from the end of one word to fill a following column.
   - ✅ CORRECT: Keep "GovernorNonPartisan" in the FIRST applicable column and leave others empty ("").
6. WORD INTEGRITY: NEVER split a single word or code at any cost.
7. THE CLUMPING RULE: 
   - If spacing is missing between semantic units, clump the entire string into the single most likely column.
   - LEAVE THE OTHER COLUMNS EMPTY ("").
8. STACKED FORM HANDLING:
   - For vertical forms, maintain strict association.
   - Use multi-line merging for coherent records.
9. VALIDITY: A row is valid if it contains at least ONE semantic fragment from the target schema.
10. LITERAL MATCH PRIORITY: If a source column header matches a target parameter, use it.
11. PREVENT REDUNDANCY: NEVER map a single source field to multiple target parameters.

================================================
TECHNICAL INSTRUCTIONS
================================================
1. Map source data to the TARGET SCHEMA by MEANING + STRICT CONCEPTUAL INTEGRITY.
2. Preserve document order.
3. RETURN JSON ONLY. { "records": [...] }

TARGET SCHEMA: { ${targetSchema} }

${documentContent ? `DOCUMENT CONTENT:\n${documentContent}` : ''}

Return JSON { "records": [...] }`
};
