const express = require('express');

module.exports = function expenseRoutes(pool/*, upload*/) {
  const router = express.Router();

  //============================EXPENCE==================================== //

  // GET ALL EXPENSES(mobile app)
  router.get("/get-all-expenses", (req, res) => {
    const userId = req.user.id;

    const sql = `
    SELECT 
      e.*,
      c.category ,
      ei.expense_name 
    FROM expense e
    LEFT JOIN category c
      ON c.id = e.category_id
    LEFT JOIN expense_items ei
      ON ei.id = e.expense_item_id
    WHERE e.user_id = $1
    ORDER BY e.id DESC
  `;

    pool.query(sql, [userId], (err, data) => {
      if (err) {
        console.error("Error fetching expenses:", err);
        return res.status(500).json({
          error: "Internal server error"
        });
      }

      return res.json(data.rows);
    });
  });

  // ADD EXPENSE(mobile app)
  router.post("/add-expense", (req, res) => {
    const { category, expenseName, cost, pDate, description, isTaxApp, percentage, taxAmount, image } = req.body;
    const userId = req.user.id;
    console.log("Received expense data:", req.body);

    const dateObject = new Date(pDate);
    const month = dateObject.getMonth() + 1;
    const year = dateObject.getFullYear();

    const sql = "INSERT INTO expense (category, expense_name, cost, p_date, description, is_tax_app, percentage, tax_amount, month, year,user_id,image) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10,$11,$12)";
    const values = [category, expenseName, cost, pDate, description, isTaxApp, percentage, taxAmount, month, year, userId, image];

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
      expenseName,
      cost,
      pDate,
      description,
      isTaxApp,
      percentage,
      taxAmount,
      image
    } = req.body;
    const userId = req.user.id;

    try {
      const dateObject = new Date(pDate);
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
        expenseName,
        cost,
        pDate,
        description,
        isTaxApp,
        percentage,
        taxAmount,
        month,
        year,
        image,
        expenseId,
        userId
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
  router.delete('/delete-expence/:expenseId', (req, res) => {
    const expenseId = parseInt(req.params.expenseId);
    const userId = req.user.id;

    const sql = "DELETE FROM expense WHERE id=$1 AND user_id=$2";
    pool.query(sql, [expenseId, userId], (err, data) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ message: 'Internal Server Error' });
      }
      return res.json(data);
    });
  });


//new
  //================================EXPENSE ITEM  ==================================== //


  router.get("/get-expense-items", (req, res) => {
    const userId = req.user.id;

    const sql = `
    SELECT 
      * ,
      c.category 
    FROM expense_items ei
    LEFT JOIN category c 
      ON c.id = ei.category_id
    WHERE ei.user_id = $1 OR ei.user_id = 0
  `;

    pool.query(sql, [userId], (err, data) => {
      if (err) return res.json(err);
      return res.json(data.rows);
    });
  });


  router.get("/get-expense-items-by-category", (req, res) => {
    const { categoryId } = req.query;
    const userId = req.user.id;

    if (!categoryId) {
      return res.status(400).json({ error: "Invalid category" });
    }

    const sql =
      `
    SELECT 
      * ,
      c.category 
    FROM expense_items ei
    LEFT JOIN category c 
      ON c.id = ei.category_id
    WHERE category_id = $1 AND (ei.user_id = $2 OR ei.user_id = 0)
  `;

    // "SELECT * FROM expense_items WHERE category_id = $1 AND (user_id = $2 or user_id = 0)";
    pool.query(sql, [categoryId, userId], (err, results) => {
      if (err) {
        console.error("Error fetching expense items:", err);
        return res.status(500).json({ error: "Internal server error" });
      }
      res.json(results.rows);
      console.log(results);
    });
  });


  // GET EXPENSE BY ITEM ID
  router.get('/getExpenseCostByItemId/:itemId', (req, res) => {
    const userId = req.user.id;
    const itemId = req.params.itemId;
    const sql = `
    SELECT 
      e.*,
      c.category ,
      ei.expense_name 
    FROM expense e
    LEFT JOIN category c
      ON c.id = e.category_id
    LEFT JOIN expense_items ei
      ON ei.id = e.expense_item_id
    WHERE e.user_id = $1 and e.id = $2
    ORDER BY e.id DESC
  `;

    pool.query(sql, [userId, itemId], (err, data) => {
      if (err) return res.json(err);
      return res.json(data.rows[0]);
    });
  });

  // YEAR-WISE EXPENSE DATA
  router.get('/getYearWiseExpenceData/:year', (req, res) => {
    const userId = req.user.id;
    const year = parseInt(req.params.year);
    const sql = `
    SELECT 
      e.*,
      c.category ,
      ei.expense_name 
    FROM expense e
    LEFT JOIN category c
      ON c.id = e.category_id
    LEFT JOIN expense_items ei
      ON ei.id = e.expense_item_id
    WHERE e.user_id = $1 and e.year= $2
    ORDER BY e.id DESC
  `;

    pool.query(sql, [userId, year], (err, data) => {
      if (err) return res.json(err);
      return res.json(data.rows);
    });
  });

  // FILTERED SOURCE DATA (actually expense grouped by Source column)
  router.get("/filteredSourceData", (req, res) => {
    const month = req.query.month;
    const year = req.query.year;
    const userId = req.user.id;

    const sql = `SELECT SUM(cost) AS totalCost FROM expense WHERE month = $1 AND year = $2 And user_id = $3 `;
    pool.query(sql, [month, year, userId], (err, result) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: "Internal Server Error" });
      }
      return res.json(result.rows);
    });
  });


  router.post("/add-expense-item", (req, res) => {
    const { categoryId, expenseName } = req.body;
    const userId = req.user.id;

    if (!categoryId) {
      return res.status(400).json({
        success: false,
        message: "Category is required"
      });
    }

    if (!expenseName || !String(expenseName).trim()) {
      return res.status(400).json({
        success: false,
        message: "Expense name is required"
      });
    }

    const normalizedExpenseName = String(expenseName)
      .trim()
      .split(/[\s_-]+/)
      .filter(word => word.length > 0)
      .map(
        word =>
          word.charAt(0).toUpperCase() +
          word.slice(1).toLowerCase()
      )
      .join("");

    const checkExpenseItemSql = `
    SELECT *
    FROM expense_items
    WHERE category_id = $1
      AND LOWER(expense_name) = LOWER($2)
      AND (user_id = $3 OR user_id = 0)
  `;

    const insertExpenseItemSql = `
    INSERT INTO expense_items
      (category_id, expense_name, user_id)
    VALUES
      ($1, $2, $3)
    RETURNING *;
  `;

    pool.query(
      checkExpenseItemSql,
      [categoryId, normalizedExpenseName, userId],
      (err, results) => {
        if (err) {
          console.error("Error checking existing expense name:", err);

          return res.status(500).json({
            success: false,
            message: "Internal server error"
          });
        }

        if (results.rows.length > 0) {
          return res.status(409).json({
            success: false,
            message: "Expense Item already exists"
          });
        }

        pool.query(
          insertExpenseItemSql,
          [categoryId, normalizedExpenseName, userId],
          (err, result) => {
            if (err) {
              console.error("Error inserting expense name:", err);

              return res.status(500).json({
                success: false,
                message: "Internal server error"
              });
            }

            return res.status(201).json({
              message: "Expense Item added successfully",
              data: result.rows[0]
            });
          }
        );
      }
    );
  });


  router.put("/update-expense-item/:expenseItemId", async (req, res) => {
    const { expenseItemId } = req.params;
    const { newexpenseItem } = req.body;
    const userId = req.user.id;

    if (!newexpenseItem || !String(newexpenseItem).trim()) {
      return res.status(400).json({
        success: false,
        message: "newexpenseItem is required"
      });
    }

    const normalizedExpenseName = String(newexpenseItem)
      .trim()
      .split(/[\s_-]+/)
      .filter(word => word.length > 0)
      .map(
        word =>
          word.charAt(0).toUpperCase() +
          word.slice(1).toLowerCase()
      )
      .join("");

    try {
      // 1. Get current category_id of the expense item
      const itemRes = await pool.query(
        `
      SELECT category_id
      FROM expense_items
      WHERE id = $1
        AND (user_id = $2 OR user_id = 0)
      `,
        [expenseItemId, userId]
      );

      if (itemRes.rowCount === 0) {
        return res.status(404).json({
          success: false,
          message: "Expense item not found or user does not have permission"
        });
      }

      const categoryId = itemRes.rows[0].category_id;

      // 2. Check duplicate expense name within the same category
      const checkSql = `
      SELECT 1
      FROM expense_items
      WHERE category_id = $1
        AND LOWER(expense_name) = LOWER($2)
        AND (user_id = $3 OR user_id = 0)
        AND id != $4
    `;

      const checkResult = await pool.query(checkSql, [
        categoryId,
        normalizedExpenseName,
        userId,
        expenseItemId
      ]);

      if (checkResult.rowCount > 0) {
        return res.status(409).json({
          success: false,
          message: "Expense item already exists"
        });
      }

      // 3. Update only expense_name
      const updateSql = `
      UPDATE expense_items
      SET expense_name = $1
      WHERE id = $2
        AND user_id = $3
      RETURNING
        id,
        category_id AS "categoryId",
        expense_name AS "expenseName",
        user_id AS "userId",
        created_at AS "createdAt";
    `;

      const result = await pool.query(updateSql, [
        normalizedExpenseName,
        expenseItemId,
        userId
      ]);

      if (result.rowCount === 0) {
        return res.status(404).json({
          success: false,
          message: "Expense item not found or no permission"
        });
      }

      return res.status(200).json({
        success: true,
        message: "Expense item updated successfully",
        data: result.rows[0]
      });

    } catch (err) {
      console.error("Error updating expense item:", err);

      return res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  });


  router.delete("/delete-expense-item/:expenseItemId", async (req, res) => {
    const expenseItemId = parseInt(req.params.expenseItemId);
    const userId = req.user.id;

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

  return router;
};
