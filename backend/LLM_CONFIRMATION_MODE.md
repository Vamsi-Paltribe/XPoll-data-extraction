# LLM Confirmation Testing Mode

## Setup

To enable LLM confirmation prompts during testing, add this to your `.env` file:

```env
REQUIRE_LLM_CONFIRMATION=true
```

## How It Works

When enabled, the system will:

1. **TIER 1 (Local Pattern Detection)**: No confirmation needed - processes immediately with 0 tokens
2. **TIER 2 (Smart LLM)**: Shows confirmation dialog before using LLM on 50 sample rows
3. **TIER 3 (TOON Fallback)**: Shows confirmation dialog before using LLM on full dataset

## Confirmation Dialog Shows:

- **Tier Level**: Which processing tier will be used
- **Confidence**: Pattern detection confidence percentage
- **Total Rows**: Number of records to process
- **Sample Rows**: How many rows will be sent to LLM (TIER 2 only)
- **Estimated Tokens**: Approximate token usage
- **Estimated Cost**: Approximate cost in USD
- **Estimated Time**: How long processing will take
- **Duplicates Removed**: Number of duplicate records removed
- **Message**: Detailed explanation of what will happen

## Example Confirmation Messages:

### TIER 2 (Smart LLM):
```
Pattern detection confidence is 55%. Need to use LLM on 50 sample rows to determine mapping formula, then apply to all 500 rows locally.

Estimated: 500 tokens, $0.0005, 5 seconds
```

### TIER 3 (TOON Fallback):
```
No clear pattern detected. Will convert to TOON format (21KB) and use LLM for full extraction. This will use approximately 10,000 tokens.

Estimated: 10,000 tokens, $0.0100, 60 seconds
```

## Testing Workflow:

1. Set `REQUIRE_LLM_CONFIRMATION=true` in `.env`
2. Restart backend server
3. Upload a file
4. If pattern detection fails:
   - Frontend shows confirmation dialog
   - User can review token/cost estimates
   - User clicks "Proceed" or "Cancel"
5. Once confirmed, processing continues normally

## Production Mode:

For production, remove or set to `false`:

```env
REQUIRE_LLM_CONFIRMATION=false
```

This will process files automatically without confirmation prompts.

## Benefits:

- ✅ Verify pattern detection is working correctly
- ✅ See token estimates before consuming them
- ✅ Test different file formats safely
- ✅ Understand which tier each file uses
- ✅ Prevent unexpected LLM costs during testing
