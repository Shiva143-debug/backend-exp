// routes/expenseRoutes.js
const express = require('express');

module.exports = function expenseRoutes(pool/*, upload*/) {
  const router = express.Router();

  //============================EXPENCE==================================== //

  // GET ALL EXPENSES(mobile app)
  router.get('/get-all-expenses/:userId', (req, res) => {
    const userId = req.params.userId;
    const sql = `SELECT * FROM expense WHERE user_id = ${userId}`;
    pool.query(sql, (err, data) => {
      if (err) return res.json(err);
      return res.json(data.rows);
    });
  });

  // ADD EXPENSE(mobile app)
  router.post("/add-expense", (req, res) => {
    const { id, category, expense_name, cost, p_date, description, is_tax_app, percentage, tax_amount, image } = req.body;

    const dateObject = new Date(p_date);
    const month = dateObject.getMonth() + 1;
    const year = dateObject.getFullYear();

    const sql = "INSERT INTO expense (category, expense_name, cost, p_date, description, is_tax_app, percentage, tax_amount, month, year,user_id,image) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10,$11,$12)";
    const values = [category, expense_name, cost, p_date, description, is_tax_app, percentage, tax_amount, month, year, id, image];

    pool.query(sql, values, (err, result) => {
      if (err) {
        console.log("error", err);
        return res.json(err);
      }
      return res.json(result);
    });
  });

  // UPDATE EXPENSE(mobile app)
  router.put("/update-expense/:expenseId", async (req, res) => {
    const { expenseId } = req.params;

    const {
      category,
      expense_name,
      cost,
      p_date,
      description,
      is_tax_app,
      percentage,
      tax_amount,
      image,
      user_id
    } = req.body;

    try {
      const dateObject = new Date(p_date);
      const month = dateObject.getMonth() + 1;
      const year = dateObject.getFullYear();

      const sql = `
      UPDATE expense
      SET
        category = $1,
        expense_name = $2,
        cost = $3,
        p_date = $4,
        description = $5,
        is_tax_app = $6,
        percentage = $7,
        tax_amount = $8,
        month = $9,
        year = $10,
        image = $11
      WHERE id = $12 AND user_id = $13
      RETURNING *
    `;

      const values = [
        category,
        expense_name,
        cost,
        p_date,
        description,
        is_tax_app,
        percentage,
        tax_amount,
        month,
        year,
        image,
        expenseId,
        user_id
      ];

      const result = await pool.query(sql, values);

      if (result.rowCount === 0) {
        return res.status(404).json({ message: "Expense not found" });
      }

      res.json({
        message: "Expense updated successfully",
        expense: result.rows[0],
      });
    } catch (err) {
      console.error("Update expense error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // DELETE EXPENSE(mobile app)
  router.delete('/delete-expence/:expenseId/:userId', (req, res) => {
    const expenseId = parseInt(req.params.expenseId);
    const userId = parseInt(req.params.userId);

    const sql = "DELETE FROM expense WHERE id=$1 AND user_id=$2";
    pool.query(sql, [expenseId, userId], (err, data) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ message: 'Internal Server Error' });
      }
      return res.json(data);
    });
  });



  //================================EXPENSE ITEM  ==================================== //

  router.get("/get-expense-items/:userId", (req, res) => {
    const userId = req.params.userId;
    const sql = `SELECT * FROM expense_items WHERE user_id = ${userId} or user_id =0`;
    pool.query(sql, (err, data) => {
      if (err) return res.json(err);
      return res.json(data.rows);
    });
  });


  router.get("/get-expense-items-by-category", (req, res) => {
    const { category, userId } = req.query;

    if (!category || !userId) {
      return res.status(400).json({ error: "Invalid category or user_id" });
    }

    const sql =
      "SELECT * FROM expense_items WHERE category = $1 AND (user_id = $2 or user_id = 0)";
    pool.query(sql, [category, userId], (err, results) => {
      if (err) {
        console.error("Error fetching expense items:", err);
        return res.status(500).json({ error: "Internal server error" });
      }
      res.json(results.rows);
      console.log(results);
    });
  });


  router.post("/add-expense-item", (req, res) => {
    const { id, category, expenseName } = req.body;

    const checkExpenseItemSql =
      "SELECT * FROM expense_items WHERE category = $1 AND expense_name = $2 AND user_id = $3";
    const insertExpenseItemSql =
      "INSERT INTO expense_items (category, expense_name, user_id) VALUES ($1, $2, $3)";
    const updateExpenseItemSql =
      "UPDATE expense_items SET expense_name = $2 WHERE category = $1  AND user_id = $3";

    const values = [category, expenseName, id];

    pool.query(checkExpenseItemSql, [category, expenseName, id], (err, results) => {
      if (err) {
        console.error("Error checking existing expense Name:", err);
        return res.status(500).json({ error: "Internal server error" });
      }

      if (results.rows.length > 0) {
        pool.query(updateExpenseItemSql, [expenseName, category, id], (err, result) => {
          if (err) {
            console.error("Error updating expense Name:", err);
            return res.status(500).json({ error: "Internal server error" });
          }
          return res.json(result);
        });
      } else {
        pool.query(insertExpenseItemSql, values, (err, result) => {
          if (err) {
            console.error("Error inserting expense Name:", err);
            return res.status(500).json({ error: "Internal server error" });
          }
          return res.json(result);
        });
      }
    });
  });


  router.put("/update-expense-item/:expenseItemId/:userId", (req, res) => {
    const { expenseItemId, userId } = req.params;
    const { newexpenseItem } = req.body;


    const updateSql = `
    UPDATE expense_items
    SET expense_name = $1
    WHERE id = $2 AND user_id = $3
    RETURNING *;
  `;

    pool.query(
      updateSql,
      [newexpenseItem, expenseItemId, userId],
      (err, result) => {
        if (err) {
          console.error("Error updating expense name:", err);
          return res.status(500).json({
            success: false,
            message: "Internal server error"
          });
        }

        if (result.rowCount === 0) {
          return res.status(404).json({
            success: false,
            message:
              "expense item not found or user does not have permission"
          });
        }

        return res.json({
          success: true,
          message: "Expense name updated successfully",
          data: result.rows[0]
        });
      }
    );
  });


  router.delete("/delete-expense-item/:expenseItemId/:userId", async (req, res) => {
    const expenseItemId = parseInt(req.params.expenseItemId);
    const userId = parseInt(req.params.userId);

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      // 1️⃣ Get expense_name
      const itemRes = await client.query(
        "SELECT expense_name FROM expense_items WHERE id = $1 AND user_id = $2",
        [expenseItemId, userId]
      );

      if (itemRes.rowCount === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({
          message: "Expense item not found"
        });
      }

      const expenseName = itemRes.rows[0].expense_name;

      // 2️⃣ Check usage in expense table
      const expenseRes = await client.query(
        "SELECT 1 FROM expense WHERE expense_name = $1 AND user_id = $2 LIMIT 1",
        [expenseName, userId]
      );

      if (expenseRes.rowCount > 0) {
        await client.query("ROLLBACK");
        return res.status(409).json({
          message: "Expense item is used in expenses and cannot be deleted"
        });
      }

      // 3️⃣ Safe to delete
      await client.query(
        "DELETE FROM expense_items WHERE id = $1 AND user_id = $2",
        [expenseItemId, userId]
      );

      await client.query("COMMIT");

      return res.json({
        message: "Expense item deleted successfully"
      });

    } catch (err) {
      await client.query("ROLLBACK");
      console.error("Delete expense item error:", err);

      return res.status(500).json({
        message: "Failed to delete expense item"
      });
    } finally {
      client.release();
    }
  });






  // GET EXPENSE BY ITEM ID
  router.get('/getExpenseCostByItemId/:id/:itemId', (req, res) => {
    const user_id = req.params.id;
    const itemId = req.params.itemId;
    const sql = `SELECT * FROM expense WHERE user_id = ${user_id} and id = ${itemId}`;
    pool.query(sql, (err, data) => {
      if (err) return res.json(err);
      return res.json(data.rows[0]);
    });
  });

  // YEAR-WISE EXPENSE DATA
  router.get('/getYearWiseExpenceData/:id/:year', (req, res) => {
    const user_id = req.params.id;
    const year = parseInt(req.params.year);
    const sql = `SELECT * FROM expense  WHERE user_id = ${user_id} And year= ${year}`;
    pool.query(sql, (err, data) => {
      if (err) return res.json(err);
      return res.json(data.rows);
    });
  });

  // FILTERED SOURCE DATA (actually expense grouped by Source column)
  router.get("/filteredSourceData", (req, res) => {
    const month = req.query.month;
    const year = req.query.year;
    const user_id = req.query.user_id;

    const sql = `SELECT Source, SUM(cost) AS totalCost FROM expense WHERE month = $1 AND year = $2 And user_id = $3 GROUP BY Source`;
    pool.query(sql, [month, year, user_id], (err, result) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: "Internal Server Error" });
      }
      return res.json(result.rows);
    });
  });



  return router;
};
