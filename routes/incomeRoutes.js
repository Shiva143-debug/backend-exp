const express = require('express');
const { success, failure } = require('../utils/response');

module.exports = function incomeRoutes(pool) {
  const router = express.Router();

  //=====================INCOME SOURCE ROUTES====================//
  // GET Income SOURCES (income_sources table)(web ,mobile)
  router.get('/get-income-sources', (req, res) => {
    const userId = req.user.id;
    const sql = `SELECT * FROM income_sources WHERE user_id = $1 or user_id = 0 order by id desc`;
    pool.query(sql, [userId], (err, data) => {
      if (err) return failure(res, "Failed to fetch income sources", 500);
      return success(res, "Income sources fetched successfully", data.rows);
    });
  });

  // ADD INCOME SOURCE NAME (income_sources table)(web ,mobile)
  router.post("/add-income-source", async (req, res) => {
    const { sourceName } = req.body;
    const userId = req.user.id;

    if (!sourceName) {
      return failure(res, "sourceName is required", 400);
    }

    const normalizedName = sourceName.trim().replace(/\w\S*/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());

    try {
      const dupCheck = await pool.query(
        "SELECT 1 FROM income_sources WHERE  (user_id = $1 OR user_id = 0) AND source_name ILIKE $2",
        [userId, normalizedName]
      );

      if (dupCheck.rowCount > 0) {
        return failure(res, "Income source already exists", 409);
      }

      const result = await pool.query(
        "INSERT INTO income_sources (user_id, source_name) VALUES ($1, $2) RETURNING *",
        [userId, normalizedName]
      );

      return success(res, "Income source added successfully", result.rows[0], 201);
    } catch (err) {
      console.error("Error adding income source:", err);
      return failure(res, "Failed to add income source", 500);
    }
  });

  // UPDATE  INCOME  SOURCE(income_sources  table)(web ,mobile)
  router.put("/update-income-source/:sourceId", async (req, res) => {
    const { sourceId } = req.params;
    const { sourceName } = req.body;
    const userId = req.user.id;

    if (!sourceName) {
      return failure(res, "sourceName is required", 400);
    }

    const normalizedSourceName = sourceName
      .split(/[\s_-]+/)
      .filter(word => word.length > 0)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join('');

    try {
      const checkSql = "SELECT 1 FROM income_sources  WHERE (user_id = $1 OR user_id = 0) AND LOWER(source_name) = LOWER($2) AND id != $3";
      const checkResult = await pool.query(checkSql, [userId, normalizedSourceName, sourceId]);

      if (checkResult.rowCount > 0) {
        return failure(res, "Income source already exists", 409);
      }

      const updateSql = `
        UPDATE income_sources
        SET source_name = $1
        WHERE id = $2 AND user_id = $3
        RETURNING *
      `;

      const result = await pool.query(updateSql, [normalizedSourceName, sourceId, userId]);

      if (result.rowCount === 0) {
        return failure(res, "income Source not found", 404);
      }

      return success(res, "Income source updated successfully", result.rows[0]);
    } catch (err) {
      console.error('Error updating Income source:', err);
      return failure(res, "Failed to update income source of income", 500);
    }
  });

  // DELETE INCOME SOURCE (income_sources table)(web ,mobile)
  router.delete('/delete-income-source/:sourceId', async (req, res) => {
    const sourceId = parseInt(req.params.sourceId);
    const userId = req.user.id;

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // 2️⃣ Check usage in incomes table
      const incomeRes = await client.query(
        'SELECT * FROM incomes WHERE source_id = $1 AND user_id = $2 LIMIT 1',
        [sourceId, userId]
      );

      if (incomeRes.rowCount > 0) {
        await client.query('ROLLBACK');
        return failure(res, 'Income source is used in incomes so cannot be deleted', 409);
      }

      // 3️⃣ Safe to delete
      await client.query(
        'DELETE FROM income_sources WHERE id = $1 AND user_id = $2',
        [sourceId, userId]
      );

      await client.query('COMMIT');

      return success(res, 'Income source deleted successfully');

    } catch (err) {
      await client.query('ROLLBACK');
      console.error('Delete income source error:', err);

      return failure(res, 'Failed to delete income source', 500);
    } finally {
      client.release();
    }
  });

  //=====================INCOME ROUTES====================//

  // GET INCOME BY MONTH AND YEAR(incomes table)(web ,mobile) 
  router.get('/get-income-by-month-year/:month/:year', (req, res) => {
    const userId = req.user.id;
    const month = parseInt(req.params.month);
    const year = parseInt(req.params.year);

    const sql = `
    SELECT 
      i.*,
      src.source_name 
    FROM incomes i
    LEFT JOIN income_sources src 
      ON src.id = i.source_id
    WHERE i.user_id = $1 AND month =$2 AND year =$3
    ORDER BY i.id DESC
  `;

    //  `SELECT  * FROM incomes WHERE user_id = $1 AND month =$2 AND year =$3`;
    pool.query(sql, [userId, month, year], (err, data) => {
      if (err) return failure(res, "Failed to fetch income", 500);
      return success(res, "Income fetched successfully", data.rows);
    });
  });

  // GET TOTAL INCOME DATA (incomes table)(web ,mobile)
  router.get("/get-total-income", (req, res) => {
    const userId = req.user.id;

    const sql = `
    SELECT 
      i.*,
      src.source_name 
    FROM incomes i
    LEFT JOIN income_sources src 
      ON src.id = i.source_id
    WHERE i.user_id = $1
    ORDER BY i.id DESC
  `;

    pool.query(sql, [userId], (err, data) => {
      if (err) {
        console.error("Error fetching income:", err);
        return failure(res, "Internal server error", 500);
      }

      return success(res, "Total income fetched successfully", data.rows);
    });
  });

  // ADD INCOME (incomes table)(web ,mobile)
  router.post("/add-income", (req, res) => {
    const { sourceId, amount, date } = req.body;
    const userId = req.user.id;
    console.log("Received data:", req.body);
    const dateObject = new Date(date);
    const Month = dateObject.getMonth() + 1;
    const Year = dateObject.getFullYear();

    const sql = "INSERT INTO incomes (user_id,source_id, amount, date,month,year) VALUES ($1,$2,$3,$4,$5,$6)";
    const values = [userId, sourceId, amount, date, Month, Year];

    pool.query(sql, values, (err, result) => {
      if (err) return failure(res, "Failed to add income", 500);
      return success(res, "Income added successfully", result.rows[0], 201);
    });
  });

  // UPDATE INCOME (incomes table)(web ,mobile)
  router.put("/update-income/:id", (req, res) => {
    const { id } = req.params;
    const { sourceId, amount, date } = req.body;
    const userId = req.user.id;

    const dateObject = new Date(date);
    const Month = dateObject.getMonth() + 1;
    const Year = dateObject.getFullYear();

    const sql = `
    UPDATE incomes
    SET source_id = $1,
        amount = $2,
        date = $3,
        month = $4,
        year = $5
    WHERE id = $6 AND user_id = $7
  `;

    const values = [
      sourceId,
      amount,
      date,
      Month,
      Year,
      id,
      userId
    ];

    pool.query(sql, values, (err, result) => {
      if (err) {
        console.error(err);
        return failure(res, "Failed to update source", 500);
      }
      return success(res, "Income source updated successfully");
    });
  });

  // DELETE INCOME (incomes table)(web ,mobile)
  router.delete('/delete-income/:sourceId', (req, res) => {
    const sourceId = parseInt(req.params.sourceId);
    const userId = req.user.id;

    const sql = "DELETE FROM incomes WHERE id=$1 AND user_id=$2";
    pool.query(sql, [sourceId, userId], (err, data) => {
      if (err) {
        console.error(err);
        return failure(res, 'Internal Server Error', 500);
      }
      return success(res, 'Income deleted successfully');
    });
  });

  return router;
};
