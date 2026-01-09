// routes/categoryRoutes.js
const express = require("express");

module.exports = function categoryRoutes(pool) {
  const router = express.Router();

  //GET ALL CATEGORIES(mobile app)
  router.get("/categories/:userId", (req, res) => {
    const userId = req.params.userId;
    const sql = `SELECT * FROM category WHERE user_id = ${userId} or user_id =0 `;
    pool.query(sql, (err, data) => {
      if (err) return res.json(err);
      return res.json(data.rows);
    });
  });

  //ADD CATEGORY(mobile app)
  router.post("/add-category", async (req, res) => {
    const { userId, category } = req.body;

    if (!userId || !category) {
      return res.status(400).json({
        message: "userId and category are required"
      });
    }

    // ✅ normalized value
    const normalizedCategory = category.trim().toUpperCase();

    try {
      const checkSql = `
      SELECT 1 FROM category
      WHERE user_id = $1 AND category = $2
    `;

      const checkResult = await pool.query(checkSql, [userId, normalizedCategory]);

      if (checkResult.rowCount > 0) {
        return res.status(409).json({
          message: "Category already exists for this user"
        });
      }

      const insertSql = `
      INSERT INTO category (user_id, category)
      VALUES ($1, $2)
      RETURNING *
    `;

      const insertResult = await pool.query(insertSql, [userId, normalizedCategory]);

      return res.status(201).json({
        message: "Category added successfully",
        data: insertResult.rows[0]
      });

    } catch (error) {
      console.error("Error adding category:", error);
      return res.status(500).json({
        message: "Internal server error"
      });
    }
  });


  //UPDATE CATEGORY (mobile app)
  router.put("/update-category/:categoryId", async (req, res) => {
    const { categoryId } = req.params;
    const { oldCategory, newCategory, userId } = req.body;

    if (!oldCategory || !newCategory || !userId) {
      return res.status(400).json({
        success: false,
        message: "oldCategory, newCategory and userId are required"
      });
    }

    const client = await pool.connect();

    try {
      await client.query("BEGIN");
      const formattedNewCategory = newCategory.trim().toUpperCase();


      // 1️⃣ Update category table
      const updateCategorySql = `
      UPDATE category
      SET category = $1
      WHERE id = $2 AND user_id = $3 AND category = $4
      RETURNING *;
    `;

      const categoryResult = await client.query(updateCategorySql, [
        formattedNewCategory,
        categoryId,
        userId,
        oldCategory
      ]);

      if (categoryResult.rowCount === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({
          success: false,
          message: "Category not found or no permission"
        });
      }

      // 2️⃣ Update expense_items table
      const updateExpenseItemSql = `
      UPDATE expense_items
      SET category = $1
      WHERE category = $2 AND user_id = $3;
    `;

      await client.query(updateExpenseItemSql, [
        formattedNewCategory,
        oldCategory,
        userId
      ]);

      await client.query("COMMIT");

      return res.json({
        success: true,
        message: "Category updated successfully with proper capitalization",
        updatedCategory: categoryResult.rows[0]
      });

    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Error updating category:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    } finally {
      client.release();
    }
  });

  // DELETE CATEGORY (mobile app)
  router.delete("/delete-category/:categoryId/:userId", async (req, res) => {
    const categoryId = parseInt(req.params.categoryId);
    const userId = parseInt(req.params.userId);

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      // 1️⃣ Check category exists
      const categoryRes = await client.query(
        "SELECT category FROM category WHERE id = $1 AND user_id = $2",
        [categoryId, userId]
      );

      if (categoryRes.rowCount === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ message: "Category not found" });
      }

      const categoryName = categoryRes.rows[0].category;

      // 2️⃣ Check usage in expense_items
      const expenseItemRes = await client.query(
        "SELECT 1 FROM expense_items WHERE category = $1 AND user_id = $2 LIMIT 1",
        [categoryName, userId]
      );

      if (expenseItemRes.rowCount > 0) {
        await client.query("ROLLBACK");
        return res.status(409).json({
          message: "Category is used in expense items and cannot be deleted"
        });
      }

      // 3️⃣ Check usage in expense table
      const expenseRes = await client.query(
        "SELECT 1 FROM expense WHERE category = $1 AND user_id = $2 LIMIT 1",
        [categoryName, userId]
      );

      if (expenseRes.rowCount > 0) {
        await client.query("ROLLBACK");
        return res.status(409).json({
          message: "Category is used in expenses and cannot be deleted"
        });
      }

      // 4️⃣ Safe to delete
      await client.query(
        "DELETE FROM category WHERE id = $1 AND user_id = $2",
        [categoryId, userId]
      );

      await client.query("COMMIT");

      return res.json({
        message: "Category deleted successfully"
      });

    } catch (err) {
      await client.query("ROLLBACK");
      console.error("Delete category error:", err);

      return res.status(500).json({
        message: "Failed to delete category"
      });
    } finally {
      client.release();
    }
  });



  return router;
};
