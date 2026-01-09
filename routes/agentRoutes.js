// routes/agentRoutes.js
const express = require('express');

module.exports = function agentRoutes(ai, pool) {
  const router = express.Router();

  // ============== AGENT HELPER FUNCTIONS ==============

  // Middleware: Simple auth (extract user from body)
  const ensureAuth = (req, res, next) => {
    const { userId, userName } = req.body;
    if (!userId) {
      return res
        .status(401)
        .json({ action: "reply", reply: "Authentication required. Please provide userId." });
    }
    req.user = { id: userId, name: userName || "User" };
    next();
  };

  // Utility: run SQL safely
  async function dbQuery(text, params) {
    const client = await pool.connect();
    try {
      const res = await client.query(text, params);
      return res.rows;
    } finally {
      client.release();
    }
  }

  // Minimal app schema describing screens & actions
  const appSchema = {
    screens: {
      Dashboard: "Shows monthly & category summaries",
      Add: "Add screen with types: income, expense, savings",
      Reports: "Various monthly/yearly category reports",
      Login: "Login screen",
      Register: "Register screen"
    },
    actions: [
      "navigate(screenName)",
      "addEntry(type, name, amount, category, date, note)",
      "getSummary(period)",
    ]
  };

  // Build the instruction prompt for the LLM
  function buildPrompt(userText, context = {}) {
    return `
You are an assistant for an Expenditure mobile app.
Goal: interpret user text/voice and either answer or return a JSON action the app can execute.

IMPORTANT TABLE MAPPING:
- "expense" or "cost": expense table (column: cost) - track spending
- "income" or "source": source table (column: amount) - track income
- "savings": savings table (column: amount) - track savings
- "categories": list all expense categories for user
- "subcategories" or "products": product table (column: product, with category + user_id)

App Schema:
${JSON.stringify(appSchema, null, 2)}

Context (auth/user/app state):
${JSON.stringify(context, null, 2)}

User message:
"""${userText}"""

Rules:
1) If the user requests navigation or an operation, respond ONLY with valid JSON and nothing else.
2) JSON must have either "action":"reply" with "reply" text OR an action object:
   Examples:
   {"action":"navigate","screen":"Add","params":{"type":"expense"}}
   {"action":"addEntry","entry":{"type":"expense","name":"bread","amount":120,"category":"food","date":"2025-12-03","note":""}}
   {"action":"reply","reply":"You spent ₹2,400 in Nov across 5 categories."}
3) If you need data from the backend (e.g., totals), return a command to call the backend with one of these calls:
   - "expense_monthly": monthly expense total - params: {month, year} - queries expense table (cost column)
   - "expense_yearly": yearly expense total - params: {year} - queries expense table (cost column)
   - "income_monthly": monthly income total - params: {month, year} - queries source table (amount column)
   - "income_yearly": yearly income total - params: {year} - queries source table (amount column)
   - "savings_monthly": monthly savings total - params: {month, year} - queries savings table (amount column)
   - "savings_yearly": yearly savings total - params: {year} - queries savings table (amount column)
   - "category_breakdown": expense breakdown by category - params: {month, year}
   - "category_year_total": total expense for a specific category in a year - params: {category, year}
   - "category_month_total": total expense for a specific category in a given month & year - params: {category, month, year}
   - "list_categories": list all categories for the user
   - "list_subcategories": list subcategories (products); params: {category?} - if category omitted, show counts per category
   - "all_years_data": get all years breakdown for expense/income/savings - params: {type: "expense"|"income"|"savings"}
   Example: {"action":"need_data","call":"expense_monthly","params":{"month":12,"year":2025}}
4) Always prefer structured action when the user wants the app to do something.
5) For queries without explicit year, use current year but also suggest "all_years_data" for comparison.
6) When uncertain, reply with a clarifying question in "reply" action.

7) If the user specifies a category but not a subcategory/product, you may still call "addEntry" with only category.
   The backend will check the database:
   - If there are multiple subcategories, it will reply with a list (without inserting).
   - After that reply, when the user chooses one (e.g., "use Cigarette", "yes that subcategory"), you MUST call "addEntry" again
     including the chosen subcategory as entry.product, and keep the same category, amount, date, description, etc.

8) When the backend lists possible subcategories, your next JSON should:
   - Reconstruct the full "entry" (category, amount, date, note, etc.) and
   - Fill "product" with the chosen subcategory.

9) When uncertain, reply with a clarifying question in "reply" action.

10) If user says "add expense <something> as subcategory", or uses wording like
  "add <X> as subcategory", "add <X> under category Y", "make <X> a subcategory",
  ALWAYS convert this into an addEntry action.

- Your job is NOT to ask the user what they mean. Instead:
  - Treat the word after "add expense" or "add" as the subcategory/product.
  - If no category is given, leave category empty and send addEntry so backend
    can list the available categories or subcategories.

    - For every "addEntry" action, you MUST include "amount" as a pure number (no currency symbols or words),
  for example: "amount": 300, not "300 rupees".

Example:
User: "add expense Apartment Rent as subcategory"
You MUST return:
{
  "action": "addEntry",
  "entry": {
     "product": "Apartment Rent"
  }
}



Return value: single JSON object.
`;
  }

  // Helper: Extract month and year from period string (YYYY-MM)
  function extractMonthYear(periodStr) {
    const match = periodStr.match(/(\d{4})-(\d{2})/);
    if (match) {
      return { year: parseInt(match[1]), month: parseInt(match[2]) };
    }
    return null;
  }

  // ============== AGENT ENDPOINT ==============
  router.post("/agent", ensureAuth, async (req, res) => {
    try {
      const user = req.user;
      const userMessage = req.body.message;
      const context = {
        userId: user.id,
        userName: user.name,
        currentDate: new Date().toISOString().split("T")[0]
      };

      const prompt = buildPrompt(userMessage, context);
      console.log("Agent prompt:", prompt);

      // Call Gemini API
      const geminiResponse = await ai.models.generateContent({
        model: "gemini-2.0-flash",
        contents: prompt,
      });

      let text = geminiResponse.text ?? JSON.stringify(geminiResponse);
      console.log("Raw text from LLM:", text);

      // Extract JSON from markdown code blocks if present
      const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (jsonMatch && jsonMatch[1]) {
        text = jsonMatch[1].trim();
        console.log("Extracted JSON from markdown:", text);
      }

      // Try parse JSON
      let parsed;
      try {
        parsed = JSON.parse(text);
        console.log("Parsed agent response:", parsed);
        console.log("action:", parsed.action);
      } catch (err) {
        console.error("JSON parse error:", err);
        return res.json({ action: "reply", reply: text });
      }

      // ========== HANDLE "need_data" CALLS ==========
      if (parsed.action === "need_data") {
        const { call, params } = parsed;
        const {
          period,
          month: paramMonth,
          year: paramYear,
          userId: requestedUserId,
          type,
          category
        } = params || {};

        const targetUserId = requestedUserId || user.id;
        let queryMonth = paramMonth;
        let queryYear = paramYear;

        // Extract month/year from period if not explicitly provided
        if (period && !queryMonth && !queryYear) {
          const extracted = extractMonthYear(period);
          if (extracted) {
            queryMonth = extracted.month;
            queryYear = extracted.year;
          }
        }

        // Default to current month/year if not provided
        if (!queryMonth || !queryYear) {
          const now = new Date();
          queryMonth = queryMonth || now.getMonth() + 1;
          queryYear = queryYear || now.getFullYear();
        }

        console.log(
          `Agent query: call=${call}, userId=${targetUserId}, month=${queryMonth}, year=${queryYear}`
        );

        try {
          // ====== EXPENSE QUERIES (cost column) ======
          // if (call === "expense_monthly") {
          //   const rows = await dbQuery(
          //     `SELECT COALESCE(SUM(cost),0) AS total FROM expense WHERE user_id=$1 AND month=$2 AND year=$3`,
          //     [targetUserId, queryMonth, queryYear]
          //   );
          //   const total = rows[0]?.total ?? 0;
          //   const monthName = new Date(queryYear, queryMonth - 1).toLocaleString(
          //     "en-US",
          //     { month: "long" }
          //   );
          //   return res.json({
          //     action: "reply",
          //     reply: `Your expenses in ${monthName} ${queryYear}: ₹${total}`
          //   });
          // }

          // place inside handlerMap, replacing previous expense_monthly
          if (call === "expense_monthly") {
            const { month, year } = params;
            const limit = (params && params.limit) ? Math.min(200, Number(params.limit)) : 50; // cap results
            // 1) total
            const totalRows = await dbQuery(
              `SELECT COALESCE(SUM(cost),0) AS total
     FROM expense
     WHERE user_id=$1 AND month=$2 AND year=$3`,
              [targetUserId, month, year]
            );
            const total = Number(totalRows[0]?.total ?? 0);

            // 2) details (most recent first)
            const rows = await dbQuery(
              `SELECT category, product, cost, p_date, description
              FROM expense
              WHERE user_id=$1 AND month=$2 AND year=$3
              ORDER BY p_date DESC, id DESC
              LIMIT $4`,
              [targetUserId, month, year, limit]
            );

            // 3) build readable text summary (show up to 10 items)
            const monthName = new Date(year, month - 1).toLocaleString('en-US', { month: 'long' });
            let replyText = `Your expenses in ${monthName} ${year}: ₹${total}\n\n`;
            if (!rows || rows.length === 0) {
              replyText += `No detailed expense records found for ${monthName} ${year}.`;
            } else {
              const showCount = Math.min(rows.length, 10);
              replyText += `Showing ${showCount} most recent ${showCount === 1 ? 'entry' : 'entries'} are`;
              // for (let i = 0; i < showCount; i++) {
              //   const r = rows[i];
              //   // safe date formatting
              //   const dateStr = r.p_date ? new Date(r.p_date).toISOString().split('T')[0] : 'unknown date';
              //   const cat = r.category ?? 'Unknown';
              //   const prod = r.product ?? '-';
              //   const note = r.description ? ` — ${r.description}` : '';
              //   replyText += `• ${dateStr} — ${cat} / ${prod} — ₹${r.cost}${note}\n`;
              // }
              // if (rows.length > showCount) {
              //   replyText += `\n(and ${rows.length - showCount} .`;
              // }
            }

            // 4) return both text and structured data

            return res.json({
              action: 'reply',
              reply: replyText,
              data: {
                total,
                month,
                year,
                items: rows // array of objects { category, product, cost, p_date, description }
              }
            });
            // return {
            //   action: 'reply',
            //   reply: replyText,
            //   data: {
            //     total,
            //     month,
            //     year,
            //     items: rows // array of objects { category, product, cost, p_date, description }
            //   }
            // };
          }


          if (call === "expense_yearly") {
            const rows = await dbQuery(
              `SELECT COALESCE(SUM(cost),0) AS total FROM expense WHERE user_id=$1 AND year=$2`,
              [targetUserId, queryYear]
            );
            const total = rows[0]?.total ?? 0;

            // Also get all years breakdown
            const allYears = await dbQuery(
              `SELECT year, COALESCE(SUM(cost),0) AS total FROM expense WHERE user_id=$1 GROUP BY year ORDER BY year DESC`,
              [targetUserId]
            );

            let response = `Your total expenses in ${queryYear}: ₹${total}`;
            // allYears.forEach((row) => {
            //   response += `  ${row.year}: ₹${row.total}\n`;
            // });

            return res.json({ action: "reply", reply: response });
          }

          // ====== INCOME QUERIES (source.amount) ======
          if (call === "income_monthly") {
            const rows = await dbQuery(
              `SELECT COALESCE(SUM(amount),0) AS total FROM source WHERE user_id=$1 AND month=$2 AND year=$3`,
              [targetUserId, queryMonth, queryYear]
            );
            const total = rows[0]?.total ?? 0;
            const monthName = new Date(queryYear, queryMonth - 1).toLocaleString(
              "en-US",
              { month: "long" }
            );
            return res.json({
              action: "reply",
              reply: `Your income in ${monthName} ${queryYear}: ₹${total}`
            });
          }

          if (call === "income_yearly") {
            const rows = await dbQuery(
              `SELECT COALESCE(SUM(amount),0) AS total FROM source WHERE user_id=$1 AND year=$2`,
              [targetUserId, queryYear]
            );
            const total = rows[0]?.total ?? 0;

            // Also get all years breakdown
            const allYears = await dbQuery(
              `SELECT year, COALESCE(SUM(amount),0) AS total FROM source WHERE user_id=$1 GROUP BY year ORDER BY year DESC`,
              [targetUserId]
            );

            let response = `Your total income in ${queryYear}: ₹${total}`;
            // allYears.forEach((row) => {
            //   response += `  ${row.year}: ₹${row.total}\n`;
            // });

            return res.json({ action: "reply", reply: response });
          }

          // ====== SAVINGS QUERIES (savings.amount) ======
          if (call === "savings_monthly") {
            const rows = await dbQuery(
              `SELECT COALESCE(SUM(amount),0) AS total FROM savings WHERE user_id=$1 AND month=$2 AND year=$3`,
              [targetUserId, queryMonth, queryYear]
            );
            const total = rows[0]?.total ?? 0;
            const monthName = new Date(queryYear, queryMonth - 1).toLocaleString(
              "en-US",
              { month: "long" }
            );
            return res.json({
              action: "reply",
              reply: `Your savings in ${monthName} ${queryYear}: ₹${total}`
            });
          }

          if (call === "savings_yearly") {
            const rows = await dbQuery(
              `SELECT COALESCE(SUM(amount),0) AS total FROM savings WHERE user_id=$1 AND year=$2`,
              [targetUserId, queryYear]
            );
            const total = rows[0]?.total ?? 0;

            // Also get all years breakdown
            const allYears = await dbQuery(
              `SELECT year, COALESCE(SUM(amount),0) AS total FROM savings WHERE user_id=$1 GROUP BY year ORDER BY year DESC`,
              [targetUserId]
            );

            let response = `Your total savings in ${queryYear}: ₹${total}`;
            // allYears.forEach((row) => {
            //   response += `  ${row.year}: ₹${row.total}\n`;
            // });

            return res.json({ action: "reply", reply: response });
          }

          // ====== CATEGORY BREAKDOWN (expense by category) ======
          if (call === "category_breakdown") {
            const rows = await dbQuery(
              `SELECT category, COALESCE(SUM(cost),0) AS total
                  FROM expense
                  WHERE user_id=$1 AND month=$2 AND year=$3
                  GROUP BY category
                  ORDER BY total DESC`,
              [targetUserId, queryMonth, queryYear]
            );

            const monthName = new Date(queryYear, queryMonth - 1).toLocaleString(
              "en-US",
              { month: "long" }
            );

            if (rows.length === 0) {
              return res.json({
                action: "reply",
                reply: `No expenses recorded for ${monthName} ${queryYear}.`
              });
            }

            const breakdown = rows
              .map((r) => `  ${r.category}: ₹${r.total}`)
              .join("\n");

            return res.json({
              action: "reply",
              reply: `Expense breakdown for ${monthName} ${queryYear}:\n${breakdown}`
            });
          }

          // ====== CATEGORY YEAR TOTAL (e.g. "how much did I spend this year on food") ======
          if (call === "category_year_total") {
            if (!category) {
              return res.json({
                action: "reply",
                reply: "Please specify which category you mean, for example 'food' or 'travel'."
              });
            }


            const rows = await dbQuery(
              `SELECT COALESCE(SUM(cost),0) AS total
              FROM expense
              WHERE user_id=$1 AND year=$2 AND category ILIKE $3`,
              [targetUserId, queryYear, category]
            );

            const total = rows[0]?.total ?? 0;

            return res.json({
              action: "reply",
              reply: `In ${queryYear}, you spent ₹${total} for ${category}.`
            });
          }

          // ====== CATEGORY MONTH TOTAL (e.g. "how much did I spend this month on food") ======
          if (call === "category_month_total") {
            if (!category) {
              return res.json({
                action: "reply",
                reply: "Please specify which category you mean, for example 'food' or 'travel'."
              });
            }

            const rows = await dbQuery(
              `SELECT COALESCE(SUM(cost),0) AS total
                FROM expense
                WHERE user_id=$1 AND year=$2 AND month=$3 AND category ILIKE $4`,
              [targetUserId, queryYear, queryMonth, category]
            );

            const total = rows[0]?.total ?? 0;
            const monthName = new Date(queryYear, queryMonth - 1).toLocaleString(
              "en-US",
              { month: "long" }
            );

            return res.json({
              action: "reply",
              reply: `In ${monthName} ${queryYear}, you spent ₹${total} .`
            });
          }


          // ====== LIST CATEGORIES ======
          if (call === "list_categories") {
            const rows = await dbQuery(
              `SELECT * FROM category WHERE user_id=$1 OR user_id=0 ORDER BY category`,
              [targetUserId]
            );
            if (rows.length === 0) {
              return res.json({
                action: "reply",
                reply: `You have no categories set up yet.`
              });
            }
            const categories = rows
              .map((r) => `  • ${r.category}`)
              .join("\n");
            return res.json({
              action: "reply",
              reply: `Your categories:\n${categories}\n\nTotal: ${rows.length} categories`
            });
          }

          // ====== LIST SUBCATEGORIES / PRODUCTS ======
          if (call === "list_subcategories") {
            // If category is provided: list all products in that category
            if (category) {
              const rows = await dbQuery(
                `SELECT product FROM product
                 WHERE (user_id=$1 OR user_id=0) AND category=$2
                 ORDER BY product`,
                [targetUserId, category]
              );
              if (rows.length === 0) {
                return res.json({
                  action: "reply",
                  reply: `No subcategories found under "${category}".`
                });
              }
              const prods = rows.map((r) => `  • ${r.product}`).join("\n");
              return res.json({
                action: "reply",
                reply: `Subcategories under "${category}":\n${prods}\n\nTotal: ${rows.length} subcategories`
              });
            }

            // If category not provided: show categories with product counts
            const rows = await dbQuery(
              `SELECT category, COUNT(*) AS count
               FROM product
               WHERE user_id=$1 OR user_id=0
               GROUP BY category
               ORDER BY category`,
              [targetUserId]
            );

            if (rows.length === 0) {
              return res.json({
                action: "reply",
                reply: `You have no subcategories/products yet.`
              });
            }

            const lines = rows
              .map((r) => `  • ${r.category}: ${r.count} subcategories`)
              .join("\n");

            return res.json({
              action: "reply",
              reply: `Your categories & number of subcategories:\n${lines}`
            });
          }

          // ====== ALL YEARS DATA (expense/income/savings) ======
          if (call === "all_years_data") {
            let tableName = "expense";
            let columnName = "cost";
            const dataType = type || "expense";

            if (dataType === "income") {
              tableName = "source";
              columnName = "amount";
            } else if (dataType === "savings") {
              tableName = "savings";
              columnName = "amount";
            }

            const allYears = await dbQuery(
              `SELECT year, COALESCE(SUM(${columnName}),0) AS total
               FROM ${tableName}
               WHERE user_id=$1
               GROUP BY year
               ORDER BY year DESC`,
              [targetUserId]
            );

            if (allYears.length === 0) {
              return res.json({
                action: "reply",
                reply: `No ${dataType} data found.`
              });
            }

            let response = `Your ${dataType} data across all years:\n`;
            allYears.forEach((row) => {
              response += `  ${row.year}: ₹${row.total}\n`;
            });

            return res.json({ action: "reply", reply: response });
          }

          // Default fallback
          return res.json({
            action: "reply",
            reply: `Unknown data request: ${call}`
          });
        } catch (dbErr) {
          console.error(`DB error for call ${call}:`, dbErr);
          return res.json({
            action: "reply",
            reply: `Could not fetch data. Please try again.`
          });
        }
      }

      // ========== HANDLE addEntry ACTION WITH CATEGORY / PRODUCT / TAX & SUBCATEGORY FLOW ==========
      // ========== HANDLE addEntry ACTION WITH CATEGORY / PRODUCT / TAX & SUBCATEGORY FLOW ==========
      if (parsed.action === "addEntry" && parsed.entry) {
        const e = parsed.entry;

        try {
          // ---- 1. DATE, MONTH, YEAR ----
          const entryDate = e.date ? new Date(e.date) : new Date();
          const month = entryDate.getMonth() + 1;
          const year = entryDate.getFullYear();
          const isoDate = entryDate.toISOString().split("T")[0];

          // ---- 2. CATEGORY & PRODUCT (SUBCATEGORY) ----
          // Raw values from LLM
          let category = (e.name || e.category || "").trim();
          let product = (e.product || "").trim();
          // const name = (e.name || "").trim();

          // Case A: only name is given => treat name as category for now
          // if (!category && name) {
          //   category = name;
          // }

          // Case B: both category and name are present and different =>
          //         treat category as category and name as product
          if (!product && category !== category.toLowerCase()) {
            product = name;
          }

          // Ensure we always have some category string
          // if (!category) {
          //   category = "General";
          // }

          // If product is still missing, try to resolve from product table
          if (!product) {
            const productRows = await dbQuery(
              `SELECT product
                FROM product
                WHERE (user_id=$1 OR user_id=0) AND category ILIKE $2
                ORDER BY product`,
              [user.id, category]
            );

            if (productRows.length === 0) {
              // No subcategories defined in DB -> treat category itself as product and continue
              product = category;
            } else if (productRows.length === 1) {
              // Only one option -> auto use it and continue
              product = productRows[0].product;
            } else {
              // Multiple subcategories and none explicitly chosen yet:
              // Ask user to choose one. DO NOT insert yet.
              const options = productRows.map((r) => r.product);
              const optionsText = options.map((p) => `• ${p}`).join("\n");

              return res.json({
                action: "reply",
                reply:
                  `I found these subcategories under "${category}":\n${optionsText}\n\n` +
                  `Please tell me which subcategory to use. For example: "use ${options[0]}" or ` +
                  `"add this under ${options[1]}".`
              });
            }
          }

          // ---- 3. AMOUNT / COST ----
          // const amountNumber = Number(e.amount) || 0;
          // ---- 3. AMOUNT / COST ----
          let amountNumber = 0;

          // If it's already a number
          if (typeof e.amount === "number") {
            amountNumber = e.amount;
          }
          // If it's a string like "300", "300 rupees", "₹ 300"
          else if (typeof e.amount === "string") {
            const match = e.amount.match(/[\d,.]+/); // find first number-ish part
            if (match) {
              amountNumber = parseFloat(match[0].replace(/,/g, ""));
            }
          }

          // If we still don't have a valid amount, ask user again instead of inserting 0
          if (!amountNumber || Number.isNaN(amountNumber)) {
            return res.json({
              action: "reply",
              reply: "I couldn't detect the amount for this expense. Please tell me the amount clearly, for example: '300 rupees'."
            });
          }


          // ---- 4. TAX FIELDS ----
          let isTaxApp = "no";
          let percentage = null;
          let taxAmount = null;

          if (
            e.is_tax_app === true ||
            e.is_tax_app === "yes" ||
            e.is_tax_app === "YES" ||
            e.is_tax_app === "Yes"
          ) {
            isTaxApp = "yes";
          }

          if (typeof e.percentage === "number" && e.percentage > 0) {
            percentage = e.percentage;
            isTaxApp = "yes";
          }

          if (typeof e.tax_amount === "number") {
            taxAmount = e.tax_amount;
          }

          if (percentage != null && taxAmount == null) {
            taxAmount = (amountNumber * percentage) / 100;
          }

          // ---- 5. DESCRIPTION ----
          const description = (e.note || e.description || "").trim() || null;

          // ---- 6. INSERT INTO expense ----
          await dbQuery(
            `INSERT INTO expense
       (user_id, category, product, cost, p_date, description,
        is_tax_app, percentage, tax_amount, month, year)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
            [
              user.id,
              category,
              product,
              amountNumber,
              isoDate,
              description,
              isTaxApp,
              percentage,
              taxAmount,
              month,
              year
            ]
          );

          // ---- 7. NICE TEXT REPLY ----
          let taxText = "";
          if (isTaxApp === "yes" && percentage != null) {
            taxText = ` (tax ${percentage}% = ₹${taxAmount ?? 0})`;
          }

          return res.json({
            action: "reply",
            reply:
              `Added ₹${amountNumber} in category "${category}" → subcategory "${product}" on ${isoDate}` +
              taxText +
              (description ? ` with note: "${description}".` : ".")
          });
        } catch (dbErr) {
          console.error("DB error inserting entry:", dbErr);
          return res.json({
            action: "reply",
            reply: `Failed to add entry. Please try again.`
          });
        }
      }


      // ========== HANDLE navigate ACTION ==========
      if (parsed.action === "navigate") {
        // Just forward the instruction; frontend can actually navigate
        return res.json(parsed);
      }

      // ========== DEFAULT: reply / other actions ==========
      return res.json(parsed);
    } catch (err) {
      console.error("Agent error:", err);
      return res
        .status(500)
        .json({ action: "reply", reply: "Sorry, I couldn't process that. Try again." });
    }
  });

  // ============== END AGENT ENDPOINT ==============
  return router;
};
