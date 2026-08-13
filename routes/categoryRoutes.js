const express = require("express");

module.exports = function categoryRoutes(pool) {
  const router = express.Router();

  //GET ALL CATEGORIES(mobile app)
  router.get("/categories", (req, res) => {
    const userId = req.user.id;
    const sql = `SELECT * FROM category WHERE user_id = $1 or user_id =0 `;
    pool.query(sql, [userId], (err, data) => {
      if (err) return res.json(err);
      return res.json(data.rows);
    });
  });

  //ADD CATEGORY(mobile app)
  router.post("/add-category", async (req, res) => {
    const { category } = req.body;
    const userId = req.user.id;
    // const trimmedCategory = category ? category.trim() : "";
    const trimmedCategory = category.trim().replace(/\w\S*/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());

    if (!trimmedCategory) {
      return res.status(400).json({
        message: "category is required"
      });
    }

    try {
      const checkSql = `
      SELECT 1 FROM category
      WHERE (user_id = $1 OR user_id = 0) AND category ILIKE $2
    `;

      const checkResult = await pool.query(checkSql, [userId, trimmedCategory]);

      if (checkResult.rowCount > 0) {
        return res.status(201).json({ message: "Category already exists" });
      }

      const insertSql = `
      INSERT INTO category (user_id, category)
      VALUES ($1, $2)
      RETURNING *
    `;

      const insertResult = await pool.query(insertSql, [userId, trimmedCategory]);

      return res.json({
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

  // UPDATE CATEGORY (mobile app)
  router.put("/update-category/:categoryId", async (req, res) => {
    const { categoryId } = req.params;
    const { newCategory } = req.body;
    const userId = req.user.id;

    // Validate category ID
    const categoryIdNumber = Number(categoryId);

    if (!Number.isInteger(categoryIdNumber)) {
      return res.status(400).json({
        success: false,
        message: "Invalid categoryId"
      });
    }

    // Validate category name
    if (!newCategory || !String(newCategory).trim()) {
      return res.status(400).json({
        success: false,
        message: "newCategory is required"
      });
    }

    // Normalize category name
    const normalizedNewCategory = String(newCategory)
      .trim()
      .split(/[\s_-]+/)
      .filter(word => word.length > 0)
      .map(
        word =>
          word.charAt(0).toUpperCase() +
          word.slice(1).toLowerCase()
      )
      .join("");

    if (!normalizedNewCategory) {
      return res.status(400).json({
        success: false,
        message: "Invalid category name"
      });
    }

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      // Check whether category already exists
      const checkSql = `
      SELECT 1
      FROM category
      WHERE (user_id = $1 OR user_id = 0)
        AND LOWER(category) = LOWER($2)
        AND id != $3
    `;

      const checkResult = await client.query(checkSql, [
        userId,
        normalizedNewCategory,
        categoryIdNumber
      ]);

      if (checkResult.rowCount > 0) {
        await client.query("ROLLBACK");

        return res.status(409).json({
          success: false,
          message: "Category already exists"
        });
      }

      // Update only category table
      const updateCategorySql = `
      UPDATE category
      SET category = $1
      WHERE id = $2
        AND user_id = $3
      RETURNING *;
    `;

      const categoryResult = await client.query(updateCategorySql, [
        normalizedNewCategory,
        categoryIdNumber,
        userId
      ]);

      if (categoryResult.rowCount === 0) {
        await client.query("ROLLBACK");

        return res.status(404).json({
          success: false,
          message: "Category not found or no permission"
        });
      }

      await client.query("COMMIT");

      return res.status(200).json({
        success: true,
        message: "Category updated successfully",
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


  //testing pending
  // DELETE CATEGORY (mobile app)
  router.delete("/delete-category/:categoryId", async (req, res) => {
    const categoryId = parseInt(req.params.categoryId);
    const userId = req.user.id;

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
