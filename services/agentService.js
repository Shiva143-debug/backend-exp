/**
 * Agent Service
 * Intelligent agent that processes user requests and routes them to appropriate APIs
 * Acts as an intermediary between LLM and the application's route handlers
 */

class AgentService {
  constructor(ai, pool) {
    this.ai = ai;
    this.pool = pool;
  }

  /**
   * Run SQL queries safely
   */
  async dbQuery(text, params) {
    const client = await this.pool.connect();
    try {
      const res = await client.query(text, params);
      return res.rows;
    } finally {
      client.release();
    }
  }

  /**
   * Extract month and year from period string (YYYY-MM)
   */
  extractMonthYear(periodStr) {
    const match = periodStr.match(/(\d{4})-(\d{2})/);
    if (match) {
      return { year: parseInt(match[1]), month: parseInt(match[2]) };
    }
    return null;
  }

  /**
   * Get month name from month number
   */
  getMonthName(month, year) {
    return new Date(year, month - 1).toLocaleString('en-US', { month: 'long' });
  }

  /**
   * Build system prompt for LLM
   */
  buildPrompt(userText, context = {}) {
    const appSchema = {
      tables: {
        expense: "Tracks spending (column: cost, month, year)",
        source: "Tracks income (column: amount, month, year)",
        savings: "Tracks savings (column: amount, month, year)",
        category: "Expense categories",
        product: "Subcategories/products under categories"
      },
      supportedQueries: [
        "What are my expenses in [month] [year]?",
        "How much income did I get this year?",
        "Show me my savings breakdown",
        "What are my expense categories?",
        "Add an expense/income/saving",
        "Show me expenses month by month",
        "What category has the most expenses?",
        "Update my expense/income",
        "Delete an entry"
      ]
    };

    return `
You are an intelligent financial assistant for an Expenditure tracking mobile app.

YOUR JOB:
1. Understand what the user wants to do (view data, add entry, update, delete, etc.)
2. Return ONLY a JSON object that describes the action
3. Never make assumptions - if user is ambiguous, ask for clarification

TABLE MAPPING:
- "expense" / "cost" / "spending" = expense table (cost column)
- "income" / "source" / "earning" = source table (amount column)  
- "savings" / "saved" = savings table (amount column)
- "categories" = category table
- "products" / "subcategories" = product table

SUPPORTED CALLS:

Data Query Calls (return {"action":"need_data","call":"...","params":{...}}):
1. expense_monthly: {"call":"expense_monthly","params":{"month":12,"year":2025}}
2. expense_yearly: {"call":"expense_yearly","params":{"year":2025}}
3. expense_all_months: {"call":"expense_all_months","params":{"year":2025}} - breakdown by all months
4. income_monthly: {"call":"income_monthly","params":{"month":12,"year":2025}}
5. income_yearly: {"call":"income_yearly","params":{"year":2025}}
6. income_all_months: {"call":"income_all_months","params":{"year":2025}} - breakdown by all months
7. savings_monthly: {"call":"savings_monthly","params":{"month":12,"year":2025}}
8. savings_yearly: {"call":"savings_yearly","params":{"year":2025}}
9. savings_all_months: {"call":"savings_all_months","params":{"year":2025}} - breakdown by all months
10. category_breakdown: {"call":"category_breakdown","params":{"month":12,"year":2025}} - expenses by category
11. category_month_total: {"call":"category_month_total","params":{"category":"Food","month":12,"year":2025}}
12. category_year_total: {"call":"category_year_total","params":{"category":"Food","year":2025}}
13. list_categories: {"call":"list_categories"}
14. list_products: {"call":"list_products","params":{"category":"Food"}}
15. all_years_data: {"call":"all_years_data","params":{"type":"expense"}} - all years comparison

Action Calls:
- Add Entry: {"action":"addEntry","entry":{"type":"expense","category":"Food","product":"Groceries","amount":500,"date":"2025-12-04","note":"Weekly shopping"}}
- Update Entry: {"action":"updateEntry","id":123,"updates":{"category":"Food","amount":600}}
- Delete Entry: {"action":"deleteEntry","id":123,"type":"expense"}

Context (auth/user info):
${JSON.stringify(context, null, 2)}

User Message:
"""${userText}"""

EXAMPLES:

User: "What did I spend on food this month?"
You return: {"action":"need_data","call":"category_month_total","params":{"category":"Food","month":12,"year":2025}}

User: "Add 500 rupees food expense for groceries today"
You return: {"action":"addEntry","entry":{"type":"expense","category":"Food","product":"Groceries","amount":500,"date":"2025-12-04","note":""}}

User: "Show me my income for every month this year"
You return: {"action":"need_data","call":"income_all_months","params":{"year":2025}}

User: "What are my expenses by category this month?"
You return: {"action":"need_data","call":"category_breakdown","params":{"month":12,"year":2025}}

User: "List all my categories"
You return: {"action":"need_data","call":"list_categories"}

RULES:
- ALWAYS return valid JSON, nothing else
- If user doesn't specify year, use ${context.currentYear || 2025}
- If user doesn't specify month, use ${context.currentMonth || 12}
- If user doesn't specify date for adding entry, use today's date
- NEVER include currency symbols in amount (e.g., 500 not "₹500" or "$500")
- ALWAYS use lowercase for type/category names
- For ambiguous requests, ask for clarification in reply action

Return value: single JSON object only.
`;
  }

  /**
   * Parse user request and return appropriate action
   */
  async processUserMessage(userMessage, userId, userName) {
    const context = {
      userId,
      userName,
      currentDate: new Date().toISOString().split('T')[0],
      currentMonth: new Date().getMonth() + 1,
      currentYear: new Date().getFullYear()
    };

    const prompt = this.buildPrompt(userMessage, context);
    console.log("[Agent] Processing:", userMessage);

    try {
      // Call Gemini API
      const geminiResponse = await this.ai.models.generateContent({
        model: "gemini-2.0-flash",
        contents: prompt
      });

      let text = geminiResponse.text ?? JSON.stringify(geminiResponse);
      console.log("[Agent] Raw response:", text.substring(0, 200));

      // Extract JSON from markdown code blocks
      const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (jsonMatch && jsonMatch[1]) {
        text = jsonMatch[1].trim();
        console.log("[Agent] Extracted from markdown");
      }

      // Parse JSON
      const parsed = JSON.parse(text);
      console.log("[Agent] Parsed action:", parsed.action);
      return parsed;
    } catch (err) {
      console.error("[Agent] Error:", err.message);
      return {
        action: "reply",
        reply: "Sorry, I couldn't process that request. Please try again."
      };
    }
  }

  /**
   * Execute need_data calls and return formatted response
   */
  async executeNeedData(call, params, userId) {
    const targetUserId = userId;
    let queryMonth = params.month;
    let queryYear = params.year || new Date().getFullYear();

    // Extract month/year from period if provided
    if (params.period && !queryMonth && !queryYear) {
      const extracted = this.extractMonthYear(params.period);
      if (extracted) {
        queryMonth = extracted.month;
        queryYear = extracted.year;
      }
    }

    // Default to current month/year if not provided
    if (!queryMonth) {
      queryMonth = new Date().getMonth() + 1;
    }

    console.log(`[Agent] Need_data: call=${call}, month=${queryMonth}, year=${queryYear}`);

    try {
      // ========== EXPENSE QUERIES ==========
      if (call === "expense_monthly") {
        const rows = await this.dbQuery(
          `SELECT COALESCE(SUM(cost),0) AS total FROM expense WHERE user_id=$1 AND month=$2 AND year=$3`,
          [targetUserId, queryMonth, queryYear]
        );
        const total = rows[0]?.total ?? 0;
        const monthName = this.getMonthName(queryMonth, queryYear);
        return `Your expenses in ${monthName} ${queryYear}: ₹${total}`;
      }

      if (call === "expense_yearly") {
        const rows = await this.dbQuery(
          `SELECT COALESCE(SUM(cost),0) AS total FROM expense WHERE user_id=$1 AND year=$2`,
          [targetUserId, queryYear]
        );
        const total = rows[0]?.total ?? 0;
        
        // Also get all years breakdown
        const allYears = await this.dbQuery(
          `SELECT year, COALESCE(SUM(cost),0) AS total FROM expense WHERE user_id=$1 GROUP BY year ORDER BY year DESC`,
          [targetUserId]
        );
        
        let response = `Your total expenses in ${queryYear}: ₹${total}\n\n📊 Year-by-year breakdown:\n`;
        allYears.forEach(row => {
          response += `  ${row.year}: ₹${row.total}\n`;
        });
        return response;
      }

      if (call === "expense_all_months") {
        const rows = await this.dbQuery(
          `SELECT month, COALESCE(SUM(cost),0) AS total FROM expense WHERE user_id=$1 AND year=$2 GROUP BY month ORDER BY month DESC`,
          [targetUserId, queryYear]
        );
        
        if (rows.length === 0) {
          return `No expenses found for ${queryYear}`;
        }
        
        let response = `Your monthly expenses for ${queryYear}:\n`;
        rows.forEach(row => {
          const monthName = this.getMonthName(row.month, queryYear);
          response += `  ${monthName}: ₹${row.total}\n`;
        });
        return response;
      }

      // ========== INCOME QUERIES ==========
      if (call === "income_monthly") {
        const rows = await this.dbQuery(
          `SELECT COALESCE(SUM(amount),0) AS total FROM source WHERE user_id=$1 AND month=$2 AND year=$3`,
          [targetUserId, queryMonth, queryYear]
        );
        const total = rows[0]?.total ?? 0;
        const monthName = this.getMonthName(queryMonth, queryYear);
        return `Your income in ${monthName} ${queryYear}: ₹${total}`;
      }

      if (call === "income_yearly") {
        const rows = await this.dbQuery(
          `SELECT COALESCE(SUM(amount),0) AS total FROM source WHERE user_id=$1 AND year=$2`,
          [targetUserId, queryYear]
        );
        const total = rows[0]?.total ?? 0;
        
        const allYears = await this.dbQuery(
          `SELECT year, COALESCE(SUM(amount),0) AS total FROM source WHERE user_id=$1 GROUP BY year ORDER BY year DESC`,
          [targetUserId]
        );
        
        let response = `Your total income in ${queryYear}: ₹${total}\n\n📊 Year-by-year breakdown:\n`;
        allYears.forEach(row => {
          response += `  ${row.year}: ₹${row.total}\n`;
        });
        return response;
      }

      if (call === "income_all_months") {
        const rows = await this.dbQuery(
          `SELECT month, COALESCE(SUM(amount),0) AS total FROM source WHERE user_id=$1 AND year=$2 GROUP BY month ORDER BY month DESC`,
          [targetUserId, queryYear]
        );
        
        if (rows.length === 0) {
          return `No income found for ${queryYear}`;
        }
        
        let response = `Your monthly income for ${queryYear}:\n`;
        rows.forEach(row => {
          const monthName = this.getMonthName(row.month, queryYear);
          response += `  ${monthName}: ₹${row.total}\n`;
        });
        return response;
      }

      // ========== SAVINGS QUERIES ==========
      if (call === "savings_monthly") {
        const rows = await this.dbQuery(
          `SELECT COALESCE(SUM(amount),0) AS total FROM savings WHERE user_id=$1 AND month=$2 AND year=$3`,
          [targetUserId, queryMonth, queryYear]
        );
        const total = rows[0]?.total ?? 0;
        const monthName = this.getMonthName(queryMonth, queryYear);
        return `Your savings in ${monthName} ${queryYear}: ₹${total}`;
      }

      if (call === "savings_yearly") {
        const rows = await this.dbQuery(
          `SELECT COALESCE(SUM(amount),0) AS total FROM savings WHERE user_id=$1 AND year=$2`,
          [targetUserId, queryYear]
        );
        const total = rows[0]?.total ?? 0;
        
        const allYears = await this.dbQuery(
          `SELECT year, COALESCE(SUM(amount),0) AS total FROM savings WHERE user_id=$1 GROUP BY year ORDER BY year DESC`,
          [targetUserId]
        );
        
        let response = `Your total savings in ${queryYear}: ₹${total}\n\n📊 Year-by-year breakdown:\n`;
        allYears.forEach(row => {
          response += `  ${row.year}: ₹${row.total}\n`;
        });
        return response;
      }

      if (call === "savings_all_months") {
        const rows = await this.dbQuery(
          `SELECT month, COALESCE(SUM(amount),0) AS total FROM savings WHERE user_id=$1 AND year=$2 GROUP BY month ORDER BY month DESC`,
          [targetUserId, queryYear]
        );
        
        if (rows.length === 0) {
          return `No savings found for ${queryYear}`;
        }
        
        let response = `Your monthly savings for ${queryYear}:\n`;
        rows.forEach(row => {
          const monthName = this.getMonthName(row.month, queryYear);
          response += `  ${monthName}: ₹${row.total}\n`;
        });
        return response;
      }

      // ========== CATEGORY QUERIES ==========
      if (call === "category_breakdown") {
        const rows = await this.dbQuery(
          `SELECT category, COALESCE(SUM(cost),0) AS total FROM expense WHERE user_id=$1 AND month=$2 AND year=$3 GROUP BY category ORDER BY total DESC`,
          [targetUserId, queryMonth, queryYear]
        );
        
        if (rows.length === 0) {
          const monthName = this.getMonthName(queryMonth, queryYear);
          return `No expenses found for ${monthName} ${queryYear}`;
        }
        
        let response = `💰 Expense breakdown for ${this.getMonthName(queryMonth, queryYear)} ${queryYear}:\n`;
        rows.forEach(row => {
          response += `  ${row.category}: ₹${row.total}\n`;
        });
        return response;
      }

      if (call === "category_month_total") {
        const { category } = params;
        if (!category) {
          return "Please specify a category";
        }
        
        const rows = await this.dbQuery(
          `SELECT COALESCE(SUM(cost),0) AS total FROM expense WHERE user_id=$1 AND category=$2 AND month=$3 AND year=$4`,
          [targetUserId, category, queryMonth, queryYear]
        );
        
        const total = rows[0]?.total ?? 0;
        const monthName = this.getMonthName(queryMonth, queryYear);
        return `Your ${category} expenses in ${monthName} ${queryYear}: ₹${total}`;
      }

      if (call === "category_year_total") {
        const { category } = params;
        if (!category) {
          return "Please specify a category";
        }
        
        const rows = await this.dbQuery(
          `SELECT COALESCE(SUM(cost),0) AS total FROM expense WHERE user_id=$1 AND category=$2 AND year=$3`,
          [targetUserId, category, queryYear]
        );
        
        const total = rows[0]?.total ?? 0;
        return `Your total ${category} expenses in ${queryYear}: ₹${total}`;
      }

      // ========== LIST CATEGORIES ==========
      if (call === "list_categories") {
        const rows = await this.dbQuery(
          `SELECT DISTINCT category FROM category WHERE user_id=$1 OR user_id=0 ORDER BY category`,
          [targetUserId]
        );
        
        if (rows.length === 0) {
          return "No categories found";
        }
        
        let response = `📂 Your categories (${rows.length}):\n`;
        rows.forEach(row => {
          response += `  • ${row.category}\n`;
        });
        return response;
      }

      // ========== LIST PRODUCTS ==========
      if (call === "list_products") {
        const { category } = params;
        let sql = `SELECT DISTINCT product FROM product WHERE user_id=$1 OR user_id=0 ORDER BY product`;
        let queryParams = [targetUserId];
        
        if (category) {
          sql = `SELECT DISTINCT product FROM product WHERE (user_id=$1 OR user_id=0) AND category=$2 ORDER BY product`;
          queryParams = [targetUserId, category];
        }
        
        const rows = await this.dbQuery(sql, queryParams);
        
        if (rows.length === 0) {
          return category ? `No products found for ${category}` : "No products found";
        }
        
        let response = category ? `🏷️  Products under "${category}" (${rows.length}):\n` : `🏷️  All products (${rows.length}):\n`;
        rows.forEach(row => {
          response += `  • ${row.product}\n`;
        });
        return response;
      }

      // ========== ALL YEARS DATA ==========
      if (call === "all_years_data") {
        const { type } = params;
        let tableName = "expense";
        let columnName = "cost";
        let dataType = type || "expense";
        
        if (dataType === "income") {
          tableName = "source";
          columnName = "amount";
        } else if (dataType === "savings") {
          tableName = "savings";
          columnName = "amount";
        }
        
        const rows = await this.dbQuery(
          `SELECT year, COALESCE(SUM(${columnName}),0) AS total FROM ${tableName} WHERE user_id=$1 GROUP BY year ORDER BY year DESC`,
          [targetUserId]
        );
        
        if (rows.length === 0) {
          return `No ${dataType} data found`;
        }
        
        let response = `📊 Your ${dataType} across all years:\n`;
        rows.forEach(row => {
          response += `  ${row.year}: ₹${row.total}\n`;
        });
        return response;
      }

      return `Unknown data call: ${call}`;

    } catch (err) {
      console.error("[Agent] DB Error:", err.message);
      return `Error fetching data: ${err.message}`;
    }
  }

  /**
   * Execute addEntry action (INSERT)
   */
  async executeAddEntry(entry, userId) {
    const { type = "expense", category, product, amount, date = new Date().toISOString().split('T')[0], note = "" } = entry;

    console.log(`[Agent] Adding entry: type=${type}, category=${category}, product=${product}, amount=${amount}`);

    try {
      const entryDate = new Date(date);
      const month = entryDate.getMonth() + 1;
      const year = entryDate.getFullYear();

      if (type === "expense") {
        const sql = `INSERT INTO expense (user_id, category, product, cost, p_date, description, month, year) 
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`;
        await this.dbQuery(sql, [userId, category, product, amount, date, note, month, year]);
        return `✅ Added ₹${amount} expense in ${category}${product ? ` (${product})` : ''}`;
      } else if (type === "income") {
        const sql = `INSERT INTO source (user_id, source, amount, date, month, year) 
                     VALUES ($1, $2, $3, $4, $5, $6)`;
        await this.dbQuery(sql, [userId, category, amount, date, month, year]);
        return `✅ Added ₹${amount} income`;
      } else if (type === "savings") {
        const sql = `INSERT INTO savings (user_id, amount, date, note, month, year) 
                     VALUES ($1, $2, $3, $4, $5, $6)`;
        await this.dbQuery(sql, [userId, amount, date, note, month, year]);
        return `✅ Added ₹${amount} to savings`;
      }

      return "Unknown entry type";
    } catch (err) {
      console.error("[Agent] AddEntry Error:", err.message);
      return `Error adding entry: ${err.message}`;
    }
  }

  /**
   * Execute updateEntry action (UPDATE)
   */
  async executeUpdateEntry(id, updates, userId, type = "expense") {
    console.log(`[Agent] Updating ${type} entry ${id}`);

    try {
      if (type === "expense") {
        const { category, product, amount, description, date } = updates;
        let updateMonth, updateYear;
        
        if (date) {
          const dateObj = new Date(date);
          updateMonth = dateObj.getMonth() + 1;
          updateYear = dateObj.getFullYear();
        }

        const sql = `UPDATE expense SET 
                     category = COALESCE($2, category),
                     product = COALESCE($3, product),
                     cost = COALESCE($4, cost),
                     description = COALESCE($5, description),
                     p_date = COALESCE($6, p_date),
                     month = COALESCE($7, month),
                     year = COALESCE($8, year)
                     WHERE id = $1 AND user_id = $9`;

        await this.dbQuery(sql, [id, category, product, amount, description, date, updateMonth, updateYear, userId]);
        return `✅ Updated expense`;
      } else if (type === "income") {
        const { amount, date } = updates;
        const sql = `UPDATE source SET amount = $1, date = $2 WHERE id = $3 AND user_id = $4`;
        await this.dbQuery(sql, [amount, date, id, userId]);
        return `✅ Updated income`;
      } else if (type === "savings") {
        const { amount, date, note } = updates;
        const sql = `UPDATE savings SET amount = $1, date = $2, note = $3 WHERE id = $4 AND user_id = $5`;
        await this.dbQuery(sql, [amount, date, note, id, userId]);
        return `✅ Updated savings`;
      }

      return "Unknown entry type";
    } catch (err) {
      console.error("[Agent] UpdateEntry Error:", err.message);
      return `Error updating entry: ${err.message}`;
    }
  }

  /**
   * Execute deleteEntry action (DELETE)
   */
  async executeDeleteEntry(id, userId, type = "expense") {
    console.log(`[Agent] Deleting ${type} entry ${id}`);

    try {
      let sql;
      
      if (type === "expense") {
        sql = `DELETE FROM expense WHERE id = $1 AND user_id = $2`;
      } else if (type === "income") {
        sql = `DELETE FROM source WHERE id = $1 AND user_id = $2`;
      } else if (type === "savings") {
        sql = `DELETE FROM savings WHERE id = $1 AND user_id = $2`;
      }

      const result = await this.dbQuery(sql, [id, userId]);
      return `✅ Deleted entry`;
    } catch (err) {
      console.error("[Agent] DeleteEntry Error:", err.message);
      return `Error deleting entry: ${err.message}`;
    }
  }
}

module.exports = AgentService;
