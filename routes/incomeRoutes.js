const express = require('express');

module.exports = function incomeRoutes(pool) {
  const router = express.Router();

  //=====================INCOME SOURCE ROUTES====================//
  // GET DEFAULT SOURCES (income_sources table)
  router.get('/get-income-sources', (req, res) => {
    const userId = req.user.id;
    const sql = `SELECT * FROM income_sources WHERE user_id = $1 or user_id = 0`;
    pool.query(sql, [userId], (err, data) => {
      if (err) return res.json(err);
      return res.json(data.rows);
    });
  });

  // ADD INCOME SOURCE NAME (income_sources table)(mobile app)
  router.post("/add-income-source", async (req, res) => {
    const { sourceName } = req.body;
    const userId = req.user.id;

    if (!sourceName) {
      return res.status(400).json({ error: "sourceName is required" });
    }

    const normalizedName = sourceName.trim().replace(/\w\S*/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());

    try {
      const dupCheck = await pool.query(
        "SELECT 1 FROM income_sources WHERE  (user_id = $1 OR user_id = 0) AND source_name ILIKE $2",
        [userId, normalizedName]
      );

      if (dupCheck.rowCount > 0) {
        return res.status(201).json({message: "Income source already exists" });
        // return res.json({ message: "Income source already exists" });
      }

      const result = await pool.query(
        "INSERT INTO income_sources (user_id, source_name) VALUES ($1, $2) RETURNING *",
        [userId, normalizedName]
      );

      return res.json(result);
    } catch (err) {
      console.error("Error adding income source:", err);
      return res.status(500).json({ error: "Failed to add income source" });
    }
  });

  // UPDATE  INCOME  SOURCE(income_sources  table)(mobile app)
  router.put("/update-income-source/:sourceId", async (req, res) => {
    const { sourceId } = req.params;
    const { sourceName } = req.body;
    const userId = req.user.id;

    if (!sourceName) {
      return res.status(400).json({ error: "sourceName is required" });
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
        return res.status(201).json({status:201, message: "Income source already exists" });
      }

      const updateSql = `
        UPDATE income_sources
        SET source_name = $1
        WHERE id = $2 AND user_id = $3
        RETURNING *
      `;

      const result = await pool.query(updateSql, [normalizedSourceName, sourceId, userId]);

      if (result.rowCount === 0) {
        return res.status(404).json({ error: "income Source not found" });
      }

      return res.status(200).json({
        message: "income source updated successfully",
        data: result.rows[0]
      });
    } catch (err) {
      console.error('Error updating Income source:', err);
      return res.status(500).json({ error: "Failed to update income source of income" });
    }
  });

  // DELETE INCOME SOURCE (income_sources table)
  router.delete('/delete-income-source/:sourceId', async (req, res) => {
    const sourceId = parseInt(req.params.sourceId);
    const userId = req.user.id;

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // 1️⃣ Get source_name
      const sourceRes = await client.query(
        'SELECT source_name FROM income_sources WHERE id = $1 AND user_id = $2',
        [sourceId, userId]
      );

      if (sourceRes.rowCount === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({
          message: 'Income source not found'
        });
      }

      const sourceName = sourceRes.rows[0].source_name;

      // 2️⃣ Check usage in incomes table
      const incomeRes = await client.query(
        'SELECT 1 FROM incomes WHERE source = $1 AND user_id = $2 LIMIT 1',
        [sourceName, userId]
      );

      if (incomeRes.rowCount > 0) {
        await client.query('ROLLBACK');
        return res.status(203).json({status:203,
          message: 'Income source is used in incomes and cannot be deleted'
        });
      }

      // 3️⃣ Safe to delete
      await client.query(
        'DELETE FROM income_sources WHERE id = $1 AND user_id = $2',
        [sourceId, userId]
      );

      await client.query('COMMIT');

      return res.json({
        message: 'Income source deleted successfully'
      });

    } catch (err) {
      await client.query('ROLLBACK');
      console.error('Delete income source error:', err);

      return res.status(500).json({
        message: 'Failed to delete income source'
      });
    } finally {
      client.release();
    }
  });



  //=====================INCOME ROUTES====================//

  // GET INCOME BY MONTH AND YEAR(incomes table)(mobile app)
  router.get('/get-income-by-month-year/:month/:year', (req, res) => {
    const userId = req.user.id;
    const month = parseInt(req.params.month);
    const year = parseInt(req.params.year);

    const sql = `SELECT  * FROM incomes WHERE user_id = $1 AND month =$2 AND year =$3`;
    pool.query(sql, [userId, month, year], (err, data) => {
      if (err) return res.json(err);
      return res.json(data.rows);
    });
  });

  // GET TOTAL INCOME DATA (incomes table)(mobile app)
  router.get('/get-total-income', (req, res) => {
    const userId = req.user.id;
    const sql = `SELECT  * FROM incomes WHERE user_id = $1 order by id desc`;
    pool.query(sql, [userId], (err, data) => {
      if (err) return res.json(err);
      return res.json(data.rows);
    });
  });

  // ADD INCOME (incomes table)(mobile app)
  router.post("/add-income", (req, res) => {
    const { source, amount, date } = req.body;
    const userId = req.user.id;
    console.log("Received data:", req.body);
    const dateObject = new Date(date);
    const Month = dateObject.getMonth() + 1;
    const Year = dateObject.getFullYear();

    const sql = "INSERT INTO incomes (user_id,source, amount, date,month,year) VALUES ($1,$2,$3,$4,$5,$6)";
    const values = [userId, source, amount, date, Month, Year];

    pool.query(sql, values, (err, result) => {
      if (err) return res.json(err);
      return res.json(result);
    });
  });

  // UPDATE INCOME (incomes table)(mobile app)
  router.put("/update-income/:sourceId", (req, res) => {
    const { sourceId } = req.params;
    const { source, amount, date } = req.body;
    const userId = req.user.id;

    const dateObject = new Date(date);
    const Month = dateObject.getMonth() + 1;
    const Year = dateObject.getFullYear();

    const sql = `
    UPDATE incomes
    SET source = $1,
        amount = $2,
        date = $3,
        month = $4,
        year = $5
    WHERE id = $6 AND user_id = $7
  `;

    const values = [
      source,
      amount,
      date,
      Month,
      Year,
      sourceId,
      userId
    ];

    pool.query(sql, values, (err, result) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: "Failed to update source" });
      }
      return res.json({ message: "Income source updated successfully" });
    });
  });

  // DELETE INCOME (incomes table)(mobile app)
  router.delete('/delete-income/:sourceId', (req, res) => {
    const sourceId = parseInt(req.params.sourceId);
    const userId = req.user.id;

    const sql = "DELETE FROM incomes WHERE id=$1 AND user_id=$2";
    pool.query(sql, [sourceId, userId], (err, data) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ message: 'Internal Server Error' });
      }
      return res.json(data);
    });
  });

  // YEAR-WISE INCOME DATA
  router.get('/getYearWiseData/:year', (req, res) => {
    const userId = req.user.id;
    const year = parseInt(req.params.year);

    const sql = `SELECT  * FROM incomes WHERE user_id = $1 AND year = $2`;
    pool.query(sql, [userId, year], (err, data) => {
      if (err) return res.json(err);
      return res.json(data.rows);
    });
  });

  // GET REPORT SOURCE (ALL)
  router.get('/getReportSource', (req, res) => {
    const userId = req.user.id;
    const sql = `SELECT  * FROM incomes WHERE user_id = $1`;
    pool.query(sql, [userId], (err, data) => {
      if (err) return res.json(err);
      return res.json(data.rows);
    });
  });

  return router;
};
