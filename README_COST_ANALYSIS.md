# Cortex Data Agent - Performance & Cost Analysis

## 1. System Limits (Frontend)
**Concurrency:** Currently, the system accepts **1 Document at a time**.
- **Reason:** The UI uses a single `stagedFile` state.
- **Scaling:** To upload multiple files at once, we would need to upgrade the UI to accept a `FileList` (e.g., `multiple` attribute on input) and loop through them.

---

## 2. Strategy Comparison: Smart Adaptive vs. Direct LLM

We currently use **Strategy A (Smart Adaptive)**. The user asked to compare this with **Strategy B (Direct LLM)**.

### Strategy A: Smart Adaptive (Current Implementation)
**How it works:**
1.  System splits PDF into Pages (Chunks).
2.  Takes a tiny sample (50 lines) from Page 1.
3.  Asks AI: "Write a Regex for this." (~500 tokens).
4.  Applies Regex to *all* 100 pages locally (0 tokens).
5.  If Page 50 has a new format, it repeats step 2-3 for that page only.

**Estimated Cost (Per 100-Page PDF):**
- **Tokens Used:** ~2,500 tokens (Assumes 5 different table formats found).
- **Cost (GPT-4o-mini):** ~$0.0015 (Less than a penny).
- **Time:** ~3 seconds (1s for AI, 2s for local processing).
- **Accuracy:** High (Regex is precise).

### Strategy B: Direct LLM (Feed whole file)
**How it works:**
1.  System extracts text from all 100 pages.
2.  Sends **ALL** text to AI: "Extract data from this." (~100,000 tokens).
3.  AI processes everything and returns a massive JSON.

**Estimated Cost (Per 100-Page PDF):**
- **Tokens Used:** ~100,000 tokens (Full text + big output).
- **Cost (GPT-4o-mini):** ~$0.06 (6 cents).
- **Time:** ~60 seconds (LLM takes longer to generate huge JSON).
- **Risk:** High chance of "Hallucination" or hitting token limits on very large files.

---

## 3. Conclusion

| Feature | Smart Adaptive (Current) | Direct LLM |
| :--- | :--- | :--- |
| **Cost** | **$0.001** (Very Cheap) | **$0.06** (60x more expensive) |
| **Speed** | **Fast** (~3s) | **Slow** (~60s) |
| **Token Usage** | ~2.5k | ~100k |
| **Scalability** | Unlimited Pages | Limit ~128k tokens |

**Verdict:** The current strategy is vastly superior for production scaling. It saves 98% of costs and prevents timeout errors on large files.
