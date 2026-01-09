# Agent API Reference

## Endpoint

```
POST /agent
```

## Headers

```
Content-Type: application/json
```

## Request Body

```json
{
  "userId": 1,
  "userName": "John Doe",
  "message": "your natural language query"
}
```

## Response

### Success (200)

```json
{
  "action": "reply",
  "reply": "Your response text here"
}
```

### Error (500)

```json
{
  "action": "reply",
  "reply": "Error message here"
}
```

## Natural Language Examples

### Data Queries

| Query | Response Type |
|-------|--------------|
| "What did I spend this month?" | Expense total |
| "Show my income breakdown" | Monthly income breakdown |
| "How much did I save?" | Savings total |
| "What are my categories?" | List of categories |
| "Show expense by category" | Category breakdown |
| "Compare year over year" | Year comparison |

### Add Entry

| Message | Action |
|---------|--------|
| "Add 500 food expense" | Creates expense entry |
| "I earned 50000 salary" | Creates income entry |
| "Save 10000" | Creates savings entry |

### Update Entry

| Message | Action |
|---------|--------|
| "Update expense 123 to 600" | Updates expense amount |
| "Change category to Food" | Updates category |

### Delete Entry

| Message | Action |
|---------|--------|
| "Delete expense 123" | Deletes expense |
| "Remove that entry" | Deletes previous entry |

## Query Call Types

### Expense Queries
- `expense_monthly` - Single month
- `expense_yearly` - Full year with breakdown
- `expense_all_months` - All months in year

### Income Queries
- `income_monthly` - Single month
- `income_yearly` - Full year with breakdown
- `income_all_months` - All months in year

### Savings Queries
- `savings_monthly` - Single month
- `savings_yearly` - Full year with breakdown
- `savings_all_months` - All months in year

### Category Queries
- `category_breakdown` - By category for month
- `category_month_total` - Specific category in month
- `category_year_total` - Specific category in year
- `list_categories` - All categories

### Listing Queries
- `list_products` - All products/subcategories
- `all_years_data` - Multi-year comparison

## Response Examples

### Monthly Expense
```
Your total expenses in December 2025: ₹25,000
```

### Year Breakdown
```
Your total expenses in 2025: ₹300,000

📊 Year-by-year breakdown:
  2025: ₹300,000
  2024: ₹280,000
  2023: ₹250,000
```

### Monthly Breakdown
```
Your monthly expenses for 2025:
  December: ₹25,000
  November: ₹22,000
  October: ₹28,000
  ...
```

### Category Breakdown
```
💰 Expense breakdown for December 2025:
  Food: ₹15,000
  Transport: ₹8,000
  Entertainment: ₹2,000
```

### List Categories
```
📂 Your categories (5):
  • Food
  • Transport
  • Entertainment
  • Utilities
  • Healthcare
```

## Error Responses

### Missing Required Field
```json
{
  "action": "reply",
  "reply": "Please provide a message."
}
```

### Authentication Error
```json
{
  "action": "reply",
  "reply": "Authentication required. Please provide userId in request body."
}
```

### Database Error
```json
{
  "action": "reply",
  "reply": "Error fetching data: [error details]"
}
```

## Health Check

```
GET /agent/health
```

Response:
```json
{
  "status": "OK",
  "message": "Agent service is running"
}
```

## Request/Response Examples

### Example 1: Simple Query

**Request:**
```bash
curl -X POST http://localhost:4000/agent \
  -H "Content-Type: application/json" \
  -d '{
    "userId": 1,
    "userName": "John",
    "message": "What did I spend this month?"
  }'
```

**Response:**
```json
{
  "action": "reply",
  "reply": "Your total expenses in December 2025: ₹25,000"
}
```

### Example 2: Breakdown Query

**Request:**
```bash
curl -X POST http://localhost:4000/agent \
  -H "Content-Type: application/json" \
  -d '{
    "userId": 1,
    "userName": "John",
    "message": "Show me expenses by category this month"
  }'
```

**Response:**
```json
{
  "action": "reply",
  "reply": "💰 Expense breakdown for December 2025:\n  Food: ₹15,000\n  Transport: ₹8,000\n  Entertainment: ₹2,000"
}
```

### Example 3: Add Entry

**Request:**
```bash
curl -X POST http://localhost:4000/agent \
  -H "Content-Type: application/json" \
  -d '{
    "userId": 1,
    "userName": "John",
    "message": "I spent 500 on groceries today"
  }'
```

**Response:**
```json
{
  "action": "reply",
  "reply": "✅ Added ₹500 expense in Food (Groceries)"
}
```

## Supported Operations

| Operation | Example Query | Supported |
|-----------|--------------|-----------|
| View monthly total | "What did I spend in December?" | ✅ |
| View yearly total | "Show my 2025 expenses" | ✅ |
| Monthly breakdown | "Show all months in 2025" | ✅ |
| Category analysis | "What did I spend on food?" | ✅ |
| Add entry | "Add 500 food expense" | ✅ |
| Update entry | "Update that to 600" | ✅ |
| Delete entry | "Delete that entry" | ✅ |
| List categories | "What are my categories?" | ✅ |
| List products | "What products in Food?" | ✅ |
| Year comparison | "Compare 2024 vs 2025" | ✅ |

## Rate Limiting

Currently: No rate limiting
Consider adding if agent receives heavy use

## Authentication

- User must provide `userId` in request body
- User can only see their own data (enforced at database level)
- No API key required (uses existing authentication)

## Limitations

- Queries are case-insensitive
- Natural language matching is AI-powered (may have edge cases)
- Maximum response length: Limited by Gemini API
- Supports years 1900-2099

## Best Practices

1. Always provide `userId` in requests
2. Use natural, conversational language
3. Include specifics (month, year, category) when possible
4. For ambiguous requests, agent will ask for clarification
5. Check agent logs for debugging: `npm start`

## Troubleshooting

### Agent not responding
- Check server is running: `npm start`
- Verify GEMINI_API_KEY is set
- Check logs for errors

### Getting "User not found"
- Verify userId exists in database
- Check user has entries in tables

### Slow responses
- First request takes longer (LLM warm-up)
- Check database has indexes on user_id, month, year

### Inaccurate results
- Ensure database tables have correct data
- Check month/year extraction logic
- Verify category spellings match exactly
