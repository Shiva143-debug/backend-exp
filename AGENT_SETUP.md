# Agent Setup & Testing Guide

## Files Created

1. **`services/agentService.js`** - Core agent service
   - Handles LLM communication
   - Executes database queries
   - Manages all data operations

2. **`routes/agentRoutesNew.js`** - Express routes
   - HTTP endpoint: `POST /agent`
   - Health check: `GET /agent/health`

3. **`AGENT_ARCHITECTURE.md`** - Complete documentation

## Quick Start

### 1. Ensure .env has GEMINI_API_KEY

```bash
GEMINI_API_KEY=your-key-here
```

### 2. Start the server

```powershell
npm start
```

You should see:
```
Gemini API Key being used: ✅ Loaded
server on 4000
```

### 3. Test the agent endpoint

**Using PowerShell/curl:**
```powershell
$body = @{
    userId = 1
    userName = "John Doe"
    message = "What did I spend on food in December?"
} | ConvertTo-Json

Invoke-WebRequest -Uri "http://localhost:4000/agent" `
  -Method POST `
  -ContentType "application/json" `
  -Body $body
```

**Using curl (bash):**
```bash
curl -X POST http://localhost:4000/agent \
  -H "Content-Type: application/json" \
  -d '{
    "userId": 1,
    "userName": "John",
    "message": "What are my expenses this month?"
  }'
```

## Sample Test Cases

### Test 1: Monthly Expense Query
```json
{
  "userId": 1,
  "userName": "Test User",
  "message": "How much did I spend in December?"
}
```

Expected response format:
```json
{
  "action": "reply",
  "reply": "Your total expenses in December 2025: ₹..."
}
```

### Test 2: Income Breakdown
```json
{
  "userId": 1,
  "userName": "Test User",
  "message": "Show me my income for every month in 2025"
}
```

### Test 3: Category Analysis
```json
{
  "userId": 1,
  "userName": "Test User",
  "message": "What category did I spend the most on?"
}
```

### Test 4: Add Entry
```json
{
  "userId": 1,
  "userName": "Test User",
  "message": "I spent 500 on groceries today"
}
```

### Test 5: List Categories
```json
{
  "userId": 1,
  "userName": "Test User",
  "message": "Show me all my categories"
}
```

### Test 6: Year Comparison
```json
{
  "userId": 1,
  "userName": "Test User",
  "message": "Compare my expenses across all years"
}
```

## Architecture Flow

```
User Input
    ↓
POST /agent
    ↓
ensureAuth middleware
    ↓
agentService.processUserMessage()
    ├─ Send to Gemini API
    └─ Get LLM response (action)
    ↓
Switch on action type:
    ├─ "reply" → return text
    ├─ "need_data" → executeNeedData() → query DB → format response
    ├─ "addEntry" → executeAddEntry() → INSERT → return confirmation
    ├─ "updateEntry" → executeUpdateEntry() → UPDATE → return confirmation
    ├─ "deleteEntry" → executeDeleteEntry() → DELETE → return confirmation
    └─ "navigate" → return navigation action
    ↓
JSON Response
```

## Supported Natural Language Examples

### Queries
- "What did I spend on food this month?"
- "Show me my income for December"
- "How much have I saved this year?"
- "What are my expense categories?"
- "Compare my spending across 2024 and 2025"
- "How much did I spend in November?"
- "Show me a breakdown by category"
- "What's my total income this year?"

### Actions
- "Add 500 rupees food expense for groceries"
- "I earned 50000 as salary today"
- "Save 10000 to savings"
- "Delete my last expense"
- "Update that expense to 600"

## Common Issues & Solutions

### Issue: "GEMINI_API_KEY not found"
**Solution:** Add key to `.env` file

### Issue: "User not found"
**Solution:** Ensure userId exists in database

### Issue: "Unauthorized"
**Solution:** Provide userId in request body

### Issue: "Bad SQL"
**Solution:** Check that all required tables exist with correct columns

## Data Required

For agent to work, ensure database has:

1. **expense table** with columns:
   - id, user_id, category, product, cost, p_date, description, month, year

2. **source table** with columns:
   - id, user_id, source, amount, date, month, year

3. **savings table** with columns:
   - id, user_id, amount, date, note, month, year

4. **category table** with columns:
   - id, user_id, category

5. **product table** with columns:
   - id, user_id, category, product

## Performance Tips

1. Ensure indexes on:
   - user_id
   - month, year
   - category

2. For large datasets (>100k entries), consider:
   - Materialized views for yearly totals
   - Caching common queries
   - Pagination for lists

## Extending the Agent

### Add New Query Type

1. Update `buildPrompt()` in AgentService to document the new call
2. Add handler in `executeNeedData()` method:

```javascript
if (call === "my_new_query") {
  const rows = await this.dbQuery(
    `SELECT ... WHERE user_id=$1`,
    [targetUserId]
  );
  return "Formatted response";
}
```

3. Test with new natural language example

### Add New Action Type

1. Update `buildPrompt()` to include in examples
2. Add handler in agent routes `/agent` endpoint:

```javascript
if (llmResponse.action === "my_new_action") {
  // Handle it
  return res.json({ action: "reply", reply: result });
}
```

## Monitoring

Check logs with:
```bash
npm start
```

Look for `[Agent]` prefixed logs to debug requests

## Next Steps

1. ✅ Created scalable agent architecture
2. ✅ Connected to all tables (expense, income, savings, categories, products)
3. ✅ Supports all CRUD operations
4. ✅ Natural language processing
5. → Test with your mobile app
6. → Monitor usage and performance
7. → Add more sophisticated queries as needed
