// routes/savingsRoutes.js
const express = require('express');

module.exports = function savingsRoutes(pool) {
  const router = express.Router();

  // GET ALL SAVINGS (mobile app)
  router.get('/get-savings/:userId', (req, res) => {
    const userId = req.params.userId;
    const sql = `SELECT * FROM savings WHERE user_id = ${userId} order by date desc`;
    pool.query(sql, (err, data) => {
      if (err) return res.json(err);
      return res.json(data.rows);
    });
  });

  // GET SAVINGS BY MONTH/YEAR (mobile app)
  router.get('/get-savings-by-month-year/:userId/:month/:year', (req, res) => {
    const userId = req.params.userId;
    const month = parseInt(req.params.month);
    const year = parseInt(req.params.year);

    const sql = `SELECT  * FROM savings WHERE user_id = $1 AND month =$2 AND year =$3`;
    pool.query(sql, [userId, month, year], (err, data) => {
      if (err) return res.json(err);
      return res.json(data.rows);
    });
  });

  // ADD SAVINGS (mobile app)
  router.post("/add-savings", (req, res) => {
    const { id, amount, date, note } = req.body;
    const dateObject = new Date(date);
    const Month = dateObject.getMonth() + 1;
    const Year = dateObject.getFullYear();

    const sql = "INSERT INTO savings (user_id, amount, date,note,month,year) VALUES ($1,$2,$3,$4,$5,$6)";
    const values = [id, amount, date, note, Month, Year];

    pool.query(sql, values, (err, result) => {
      if (err) return res.json(err);
      return res.json(result);
    });
  });

  // UPDATE SAVINGS(mobile app)
  router.put("/update-savings/:saving_id", (req, res) => {
    const { saving_id } = req.params;
    const { id, amount, date, note } = req.body;

    if (!id || !amount || !date) {
      return res.status(400).json({
        success: false,
        message: "id, amount and date are required"
      });
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

    const values = [amount, date, note, month, year, saving_id, id];

    pool.query(sql, values, (err, result) => {
      if (err) {
        console.error("Error updating savings:", err);
        return res.status(500).json({
          success: false,
          message: "Internal server error"
        });
      }

      if (result.rowCount === 0) {
        return res.status(404).json({
          success: false,
          message: "Savings record not found"
        });
      }

      return res.json({
        success: true,
        message: "Savings updated successfully",
        data: result.rows[0]
      });
    });
  });

  // DELETE SAVINGS(mobile app)
  router.delete('/delete-saving/:savingId/:userId', (req, res) => {
    const savingId = parseInt(req.params.savingId);
    const userId = parseInt(req.params.userId);

    const sql = "DELETE FROM savings WHERE id=$1 AND user_id=$2";
    pool.query(sql, [savingId, userId], (err, data) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ message: 'Internal Server Error' });
      }
      return res.json(data);
    });
  });




  
  // YEAR-WISE SAVINGS
  router.get('/getYearWiseSavingsData/:id/:year', (req, res) => {
    const user_id = req.params.id;
    const year = parseInt(req.params.year);

    const sql = `SELECT * FROM savings  WHERE user_id = ${user_id} And year= ${year}`;
    pool.query(sql, (err, data) => {
      if (err) return res.json(err);
      return res.json(data.rows);
    });
  });



  return router;
};
