const express = require("express");
const { success, failure } = require("../utils/response");

module.exports = function categoryRoutes(pool) {
  const router = express.Router();

  //GET ALL CATEGORIES( web , mobile)
  router.get("/categories", (req, res) => {
    const userId = req.user.id;
    const sql = `SELECT * FROM category WHERE user_id = $1 or user_id =0 order by id desc`;
    pool.query(sql, [userId], (err, data) => {
      if (err) return failure(res, "Failed to fetch categories", 500);
      return success(res, "Categories fetched successfully", data.rows);
    });
  });

  //ADD CATEGORY(web , mobile)
  router.post("/add-category", async (req, res) => {
    const { category } = req.body;
    const userId = req.user.id;
    // const trimmedCategory = category ? category.trim() : "";
    const trimmedCategory = category.trim().replace(/\w\S*/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());

    if (!trimmedCategory) {
      return failure(res, "category is required", 400);
    }

    try {
      const checkSql = `
      SELECT 1 FROM category
      WHERE (user_id = $1 OR user_id = 0) AND category ILIKE $2
    `;

      const checkResult = await pool.query(checkSql, [userId, trimmedCategory]);

      if (checkResult.rowCount > 0) {
        return failure(res, "Category already exists", 409);
      }

      const insertSql = `
      INSERT INTO category (user_id, category)
      VALUES ($1, $2)
      RETURNING *
    `;

      const insertResult = await pool.query(insertSql, [userId, trimmedCategory]);

      return success(res, "Category added successfully", insertResult.rows[0], 201);

    } catch (error) {
      console.error("Error adding category:", error);
      return failure(res, "Internal server error", 500);
    }
  });

  // UPDATE CATEGORY (web , mobile)
  router.put("/update-category/:categoryId", async (req, res) => {
    const { categoryId } = req.params;
    const { newCategory } = req.body;
    const userId = req.user.id;

    // Validate category ID
    const categoryIdNumber = Number(categoryId);

    if (!Number.isInteger(categoryIdNumber)) {
      return failure(res, "Invalid categoryId", 400);
    }

    // Validate category name
    if (!newCategory || !String(newCategory).trim()) {
      return failure(res, "newCategory is required", 400);
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
      return failure(res, "Invalid category name", 400);
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

        return failure(res, "Category already exists", 409);
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

        return failure(res, "Category not found or no permission", 404);
      }

      await client.query("COMMIT");

      return success(res, "Category updated successfully", categoryResult.rows[0]);

    } catch (error) {
      await client.query("ROLLBACK");

      console.error("Error updating category:", error);

      return failure(res, "Internal server error", 500);

    } finally {
      client.release();
    }
  });

  // DELETE CATEGORY (web ,mobile)
  router.delete("/delete-category/:categoryId", async (req, res) => {
    const categoryId = parseInt(req.params.categoryId);
    const userId = req.user.id;

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      // 2️⃣ Check usage in expense_items
      const expenseItemRes = await client.query(
        "SELECT 1 FROM expense_items WHERE category_id = $1 AND user_id = $2 LIMIT 1",
        [categoryId, userId]
      );

      if (expenseItemRes.rowCount > 0) {
        await client.query("ROLLBACK");
        return failure(res, "Category is used in expense items so cannot be deleted", 409);
      }

      // 3️⃣ Check usage in expense table
      const expenseRes = await client.query(
        "SELECT 1 FROM expense WHERE category_id = $1 AND user_id = $2 LIMIT 1",
        [categoryId, userId]
      );

      if (expenseRes.rowCount > 0) {
        await client.query("ROLLBACK");
        return failure(res, "Category is used in expenses and cannot be deleted", 409);
      }

      // 4️⃣ Safe to delete
      await client.query(
        "DELETE FROM category WHERE id = $1 AND user_id = $2",
        [categoryId, userId]
      );

      await client.query("COMMIT");

      return success(res, "Category deleted successfully");

    } catch (err) {
      await client.query("ROLLBACK");
      console.error("Delete category error:", err);

      return failure(res, "Failed to delete category", 500);
    } finally {
      client.release();
    }
  });

  return router;
};
