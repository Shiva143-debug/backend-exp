# Agent Architecture Documentation

## Overview

The agent is an intelligent system that processes natural language requests from users and translates them into database operations. It uses Google's Gemini API for natural language understanding and provides a unified interface to all application features.

## Architecture

```
User Request
     ↓
[Agent Routes] (routes/agentRoutesNew.js)
     ↓
[Agent Service] (services/agentService.js)
     ├─ processUserMessage() → LLM
     ├─ executeNeedData() → Database Queries
     ├─ executeAddEntry() → INSERT
     ├─ executeUpdateEntry() → UPDATE
     └─ executeDeleteEntry() → DELETE
     ↓
Response to User
```

## Core Components

### 1. Agent Service (`services/agentService.js`)

Central service that handles all agent logic:

- **processUserMessage()**: Sends user text to Gemini API for interpretation
- **executeNeedData()**: Handles all data retrieval requests
- **executeAddEntry()**: Inserts new expense/income/savings
- **executeUpdateEntry()**: Updates existing entries
- **executeDeleteEntry()**: Deletes entries

### 2. Agent Routes (`routes/agentRoutesNew.js`)

Express routes that:
- Handle authentication
- Receive user requests
- Coordinate with AgentService
- Format responses

### 3. Tables & Columns Reference

| Action | Table | Key Columns |
|--------|-------|------------|
| Expense | `expense` | `cost`, `category`, `product`, `month`, `year` |
| Income | `source` | `amount`, `source`, `month`, `year` |
| Savings | `savings` | `amount`, `note`, `month`, `year` |
| Categories | `category` | `category`, `user_id` |
| Products | `product` | `product`, `category`, `user_id` |

## Supported Queries

### Data Retrieval (need_data)

**Expense:**
- `expense_monthly` - Expenses for specific month/year
- `expense_yearly` - All expenses for a year + year-by-year breakdown
- `expense_all_months` - Monthly breakdown for a year

**Income:**
- `income_monthly` - Income for specific month/year
- `income_yearly` - All income for a year + year-by-year breakdown
- `income_all_months` - Monthly breakdown for a year

**Savings:**
- `savings_monthly` - Savings for specific month/year
- `savings_yearly` - All savings for a year + year-by-year breakdown
- `savings_all_months` - Monthly breakdown for a year

**Categories & Products:**
- `category_breakdown` - Expenses grouped by category
- `category_month_total` - Total for specific category in month
- `category_year_total` - Total for specific category in year
- `list_categories` - All categories for user
- `list_products` - All products (optionally filtered by category)

**Comparison:**
- `all_years_data` - All years comparison for expense/income/savings

### Data Modification (addEntry/updateEntry/deleteEntry)

**AddEntry:**
```json
{
  "action": "addEntry",
  "entry": {
    "type": "expense",  // "expense", "income", or "savings"
    "category": "Food",
    "product": "Groceries",
    "amount": 500,
    "date": "2025-12-04",
    "note": "Weekly shopping"
  }
}
```

**UpdateEntry:**
```json
{
  "action": "updateEntry",
  "id": 123,
  "type": "expense",
  "updates": {
    "category": "Food",
    "amount": 600
  }
}
```

**DeleteEntry:**
```json
{
  "action": "deleteEntry",
  "id": 123,
  "type": "expense"
}
```

## Example Conversations

### Example 1: Monthly Expense Query

**User:** "What did I spend on food this month?"

**LLM Response:**
```json
{
  "action": "need_data",
  "call": "category_month_total",
  "params": {
    "category": "Food",
    "month": 12,
    "year": 2025
  }
}
```

**Agent Response:**
```
Your Food expenses in December 2025: ₹5,000
```

### Example 2: Year-by-Year Income Comparison

**User:** "Show me my income for every month in 2025"

**LLM Response:**
```json
{
  "action": "need_data",
  "call": "income_all_months",
  "params": {
    "year": 2025
  }
}
```

**Agent Response:**
```
Your monthly income for 2025:
  December: ₹50,000
  November: ₹48,000
  October: ₹52,000
  ...
```

### Example 3: Add Expense

**User:** "I spent 500 on groceries today"

**LLM Response:**
```json
{
  "action": "addEntry",
  "entry": {
    "type": "expense",
    "category": "Food",
    "product": "Groceries",
    "amount": 500,
    "date": "2025-12-04",
    "note": ""
  }
}
```

**Agent Response:**
```
✅ Added ₹500 expense in Food (Groceries)
```

### Example 4: Expense Breakdown

**User:** "Show me my category breakdown for this month"

**LLM Response:**
```json
{
  "action": "need_data",
  "call": "category_breakdown",
  "params": {
    "month": 12,
    "year": 2025
  }
}
```

**Agent Response:**
```
💰 Expense breakdown for December 2025:
  Food: ₹15,000
  Transport: ₹8,000
  Entertainment: ₹3,000
  Utilities: ₹2,000
```

## Request Format

All requests to the agent endpoint:

```bash
POST /agent
Content-Type: application/json

{
  "userId": 1,
  "userName": "John Doe",
  "message": "What did I spend on food this month?"
}
```

## Response Format

All responses follow this format:

```json
{
  "action": "reply",
  "reply": "Your food expenses in December 2025: ₹5,000"
}
```

Or for navigation:

```json
{
  "action": "navigate",
  "screen": "Reports",
  "params": { }
}
```

## Default Behavior

- **Default Year:** Current year (2025)
- **Default Month:** Current month (12 for December)
- **Default Date:** Today's date
- **Default Type:** "expense"

## Error Handling

The agent gracefully handles:
- Missing required parameters
- Invalid categories
- Database errors
- Invalid user IDs
- Malformed requests

Errors are returned as helpful text replies to the user.

## Adding New Queries

To add a new query type:

1. Add the `need_data` call name to the prompt in `buildPrompt()`
2. Implement the handler in `executeNeedData()` method
3. Add documentation above with examples

Example:
```javascript
if (call === "my_custom_query") {
  const rows = await this.dbQuery(`SELECT ... WHERE user_id=$1`, [targetUserId]);
  return "Formatted response";
}
```

## Performance Considerations

- Queries are optimized with indexes on `user_id`, `month`, `year`, `category`
- Year-by-year breakdowns are calculated efficiently with GROUP BY
- Month names are calculated in JavaScript, not database

## Security

- User ID is always passed and validated
- All queries use parameterized queries (preventing SQL injection)
- Authentication middleware ensures user context
- Users can only see their own data

## Logging

Agent operations are logged with `[Agent]` prefix for debugging:

```
[Agent] New request from user 1: "What did I spend?"
[Agent] LLM Response action: need_data
[Agent] need_data call: expense_monthly
```

## Testing

Test the agent with curl:

```bash
curl -X POST http://localhost:4000/agent \
  -H "Content-Type: application/json" \
  -d '{
    "userId": 1,
    "userName": "Test User",
    "message": "What are my expenses this month?"
  }'
```

Or use Postman:
1. Create POST request to `http://localhost:4000/agent`
2. Set body to JSON with userId, userName, message
3. Send and check response

## Future Enhancements

- [ ] Multi-month/year comparisons
- [ ] Trend analysis (increasing/decreasing patterns)
- [ ] Budget alerts and recommendations
- [ ] Recurring entry detection
- [ ] Natural language filters ("expensive items", "unusual transactions")
- [ ] Summary reports generation
- [ ] Export to PDF/CSV
