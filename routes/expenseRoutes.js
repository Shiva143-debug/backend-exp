const express = require('express');
const { success, failure } = require('../utils/response');

module.exports = function expenseRoutes(pool/*, upload*/) {
  const router = express.Router();

  //============================EXPENCE==================================== //

  // GET ALL EXPENSES(web, mobile)
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
        return failure(res, "Internal server error", 500);
      }

      return success(res, "Expenses fetched successfully", data.rows);
    });
  });

  // ADD EXPENSE(web, mobile)
  router.post("/add-expense", (req, res) => {
    const { categoryId, expenseItemId, cost, pDate, description, isTaxApp, percentage, taxAmount, image } = req.body;
    const userId = req.user.id;
    console.log("Received expense data:", req.body);

    const dateObject = new Date(pDate);
    const month = dateObject.getMonth() + 1;
    const year = dateObject.getFullYear();

    const sql = "INSERT INTO expense (category_id, expense_item_id, cost, p_date, description, is_tax_app, percentage, tax_amount, month, year,user_id,image) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10,$11,$12)";
    const values = [categoryId, expenseItemId, cost, pDate, description, isTaxApp, percentage, taxAmount, month, year, userId, image];

    pool.query(sql, values, (err, result) => {
      if (err) {
        console.log("error", err);
        return failure(res, "Failed to add expense", 500);
      }
      return success(res, "Expense added successfully", result.rows[0], 201);
    });
  });

  // UPDATE EXPENSE(web , mobile)
  router.put("/update-expense/:expenseId", async (req, res) => {
    const { expenseId } = req.params;

    const {
      categoryId,
      expenseItemId,
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
        category_id = $1,
        expense_item_id = $2,
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
        categoryId,
        expenseItemId,
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
        return failure(res, "Expense not found", 404);
      }

      success(res, "Expense updated successfully", result.rows[0]);
    } catch (err) {
      console.error("Update expense error:", err);
      failure(res, "Internal server error", 500);
    }
  });

  // DELETE EXPENSE(web ,mobile)
  router.delete('/delete-expence/:expenseId', (req, res) => {
    const expenseId = parseInt(req.params.expenseId);
    const userId = req.user.id;

    const sql = "DELETE FROM expense WHERE id=$1 AND user_id=$2";
    pool.query(sql, [expenseId, userId], (err, data) => {
      if (err) {
        console.error(err);
        return failure(res, 'Internal Server Error', 500);
      }
      return success(res, 'Expense deleted successfully');
    });
  });

  //================================EXPENSE ITEM  ==================================== //

  // get Expense items(web,mobile)
  router.get("/get-expense-items", (req, res) => {
    const userId = req.user.id;

    const sql = `
       SELECT
    ei.*,
    c.category
FROM expense_items ei
LEFT JOIN category c
    ON c.id = ei.category_id
WHERE ei.user_id = $1 OR ei.user_id = 0 order by ei.id desc
  `;

    pool.query(sql, [userId], (err, data) => {
      if (err) return failure(res, "Failed to fetch expense items", 500);
      return success(res, "Expense items fetched successfully", data.rows);
    });
  });

  // get Expense items by category(web ,mobile)
  router.get("/get-expense-items-by-category", (req, res) => {
    const { categoryId } = req.query;
    const userId = req.user.id;

    if (!categoryId) {
      return failure(res, "Invalid category", 400);
    }

    const sql =
      `
    SELECT 
      ei.* ,
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
        return failure(res, "Internal server error", 500);
      }
      success(res, "Expense items fetched successfully", results.rows);
      console.log(results);
    });
  });

  //ADD Expense item(web ,mobile)
  router.post("/add-expense-item", (req, res) => {
    const { categoryId, expenseName } = req.body;
    const userId = req.user.id;

    if (!categoryId) {
      return failure(res, "Category is required", 400);
    }

    if (!expenseName || !String(expenseName).trim()) {
      return failure(res, "Expense name is required", 400);
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

          return failure(res, "Internal server error", 500);
        }

        if (results.rows.length > 0) {
          return failure(res, "Expense Item already exists", 409);
        }

        pool.query(
          insertExpenseItemSql,
          [categoryId, normalizedExpenseName, userId],
          (err, result) => {
            if (err) {
              console.error("Error inserting expense name:", err);

              return failure(res, "Internal server error", 500);
            }

            return success(res, "Expense Item added successfully", result.rows[0], 201);
          }
        );
      }
    );
  });

  //update Expense item(web, mobile)
  router.put("/update-expense-item/:expenseItemId", async (req, res) => {
    const { expenseItemId } = req.params;
    const { newexpenseItem } = req.body;
    const userId = req.user.id;

    if (!newexpenseItem || !String(newexpenseItem).trim()) {
      return failure(res, "newexpenseItem is required", 400);
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
        return failure(res, "Expense item not found or user does not have permission", 404);
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
        return failure(res, "Expense item already exists", 409);
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
        return failure(res, "Expense item not found or no permission", 404);
      }

      return success(res, "Expense item updated successfully", result.rows[0]);

    } catch (err) {
      console.error("Error updating expense item:", err);

      return failure(res, "Internal server error", 500);
    }
  });

  //Delete Expense item(web ,mobile)
  router.delete("/delete-expense-item/:expenseItemId", async (req, res) => {
    const expenseItemId = parseInt(req.params.expenseItemId);
    const userId = req.user.id;

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      // 2️⃣ Check usage in expense table
      const expenseRes = await client.query(
        "SELECT 1 FROM expense WHERE expense_item_id = $1 AND user_id = $2 LIMIT 1",
        [expenseItemId, userId]
      );

      if (expenseRes.rowCount > 0) {
        await client.query("ROLLBACK");
        return failure(res, "Expense item is used in expenses and cannot be deleted", 409);
      }

      // 3️⃣ Safe to delete
      await client.query(
        "DELETE FROM expense_items WHERE id = $1 AND user_id = $2",
        [expenseItemId, userId]
      );

      await client.query("COMMIT");

      return success(res, "Expense item deleted successfully");

    } catch (err) {
      await client.query("ROLLBACK");
      console.error("Delete expense item error:", err);

      return failure(res, "Failed to delete expense item", 500);
    } finally {
      client.release();
    }
  });

  return router;
};
