const express = require('express');
const { success, failure } = require('../utils/response');

module.exports = function savingsRoutes(pool) {
  const router = express.Router();

  // GET ALL SAVINGS (web ,mobile)
  router.get('/get-savings', (req, res) => {
    const userId = req.user.id;
    const sql = `SELECT * FROM savings WHERE user_id = $1 order by date desc`;
    pool.query(sql, [userId], (err, data) => {
      if (err) return failure(res, "Failed to fetch savings", 500);
      return success(res, "Savings fetched successfully", data.rows);
    });
  });

  // GET SAVINGS BY MONTH/YEAR (web app) its not needed because which is only for getting amount
  router.get('/get-savings-by-month-year/:month/:year', (req, res) => {
    const userId = req.user.id;
    const month = parseInt(req.params.month);
    const year = parseInt(req.params.year);

    const sql = `SELECT  * FROM savings WHERE user_id = $1 AND month =$2 AND year =$3`;
    pool.query(sql, [userId, month, year], (err, data) => {
      if (err) return failure(res, "Failed to fetch savings", 500);
      return success(res, "Savings fetched successfully", data.rows);
    });
  });

  // ADD SAVINGS (web ,mobile)
  router.post("/add-savings", (req, res) => {
    const { amount, date, note } = req.body;
    const userId = req.user.id;
    const dateObject = new Date(date);
    const Month = dateObject.getMonth() + 1;
    const Year = dateObject.getFullYear();

    const sql = "INSERT INTO savings (user_id, amount, date,note,month,year) VALUES ($1,$2,$3,$4,$5,$6)";
    const values = [userId, amount, date, note, Month, Year];

    pool.query(sql, values, (err, result) => {
      if (err) return failure(res, "Failed to add savings", 500);
      return success(res, "Savings added successfully", result.rows[0], 201);
    });
  });

  // UPDATE SAVINGS(web ,mobile)
  router.put("/update-savings/:saving_id", (req, res) => {
    const { saving_id } = req.params;
    const { amount, date, note } = req.body;
    const userId = req.user.id;

    if (!amount || !date) {
      return failure(res, "amount and date are required", 400);
    }

    const dateObject = new Date(date);
    const month = dateObject.getMonth() + 1;
    const year = dateObject.getFullYear();

    const sql = `
    UPDATE savings
    SET amount = $1,
        date = $2,
        note = $3,
        month = $4,
        year = $5
    WHERE id = $6 AND user_id = $7
    RETURNING *;
  `;

    const values = [amount, date, note, month, year, saving_id, userId];

    pool.query(sql, values, (err, result) => {
      if (err) {
        console.error("Error updating savings:", err);
        return failure(res, "Internal server error", 500);
      }

      if (result.rowCount === 0) {
        return failure(res, "Savings record not found", 404);
      }

      return success(res, "Savings updated successfully", result.rows[0]);
    });
  });

  // Delete SAVINGS(web ,mobile)
  router.delete('/delete-saving/:savingId', (req, res) => {
    const savingId = parseInt(req.params.savingId);
    const userId = req.user.id;

    const sql = "DELETE FROM savings WHERE id=$1 AND user_id=$2";
    pool.query(sql, [savingId, userId], (err, data) => {
      if (err) {
        console.error(err);
        return failure(res, 'Internal Server Error', 500);
      }
      return success(res, 'Savings deleted successfully');
    });
  });

  return router;
};
