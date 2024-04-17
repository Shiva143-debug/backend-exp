const express = require('express');
// const mysql = require('mysql');
const { Pool } = require('pg');
const cors = require('cors')
const bodyParser = require('body-parser');
const multer = require('multer')
const upload = multer({ dest: 'uploads/' });
const nodemailer = require('nodemailer');


const app = express()
app.use(cors())
app.use(express.json())
app.use(bodyParser.json());

// const pool = mysql.createConnection({
//     host: "148.72.246.179",
//     user: "shaik",
//     password: "",
//     database: 'test'
// })
const pool = new Pool({
    user: 'oss_admin',
    host: '148.72.246.179',
    database: 'expense',
    password: 'Latitude77',
    schema:"public",
    port: '5432', 
});


app.post("/addshopcategory", (req, res) => {
    const { id, category } = req.body;
    const sqlSelect = "SELECT * FROM category WHERE user_id = $1 AND category = $2";
    const sqlInsert = "INSERT INTO category (user_id, category) VALUES ($1, $2)";
    // const sqlUpdate = "UPDATE category SET category = $2 WHERE user_id = $1 AND category = $2";
    const valuesSelect = [id, category];

    // Check if the category already exists for the user_id
    pool.query(sqlSelect, valuesSelect, (err, results) => {
        if (err) {
            console.error('Error checking existing category:', err);
            return res.status(500).json({ error: 'Internal server error' });
        }

        if (results.rows.length > 0) {
            // Category already exists, you can choose to update or ignore
            // For now, we'll ignore and return success
            return res.json({ message: 'Category already exists for the user' });
        } else {
            // Category does not exist, insert the new category
            pool.query(sqlInsert, [id, category], (err, result) => {
                if (err) {
                    console.error('Error inserting category:', err);
                    return res.status(500).json({ error: 'Internal server error' });
                }
                return res.json(result);
            });
        }
    });
});

app.post("/addproduct", (req, res) => {
    const { id, category, product } = req.body;
    const checkProductSql = "SELECT * FROM product WHERE category = $1 AND product = $2 AND user_id = $3";
    const insertProductSql = "INSERT INTO product (category, product, user_id) VALUES ($1, $2, $3)";
    const updateProductSql = "UPDATE product SET product = $2 WHERE category = $1  AND user_id = $3";
    const values = [category, product,id];

    // Check if the product already exists for the category and product
    pool.query(checkProductSql, [category, product,id], (err, results) => {
        if (err) {
            console.error('Error checking existing product:', err);
            return res.status(500).json({ error: 'Internal server error' });
        }

        if (results.rows.length > 0) {
            // Product already exists, update the user_id
            pool.query(updateProductSql, [ product,category,id], (err, result) => {
                if (err) {
                    console.error('Error updating product:', err);
                    return res.status(500).json({ error: 'Internal server error' });
                }
                return res.json(result);
            });
        } else {
            // Product does not exist, insert the new product
            pool.query(insertProductSql, values, (err, result) => {
                if (err) {
                    console.error('Error inserting product:', err);
                    return res.status(500).json({ error: 'Internal server error' });
                }
                return res.json(result);
            });
        }
    });
});

app.post("/addSource", (req, res) => {
    const {id, source, amount, date } = req.body;
    console.log("Received data:", req.body);
    const dateObject = new Date(date);
    const Month = dateObject.getMonth() + 1;
    const Year = dateObject.getFullYear();
    console.log(Month)
    console.log(Year)

    const sql = "INSERT INTO source (user_id,source, amount, date,month,year) VALUES ($1,$2,$3,$4,$5,$6)";
    const values = [id,source, amount, date, Month, Year];
    console.log(values)

    pool.query(sql, values, (err, result) => {
        if (err) return res.json(err)
        return res.json(result)
    })
})

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: 'shivarama99666@gmail.com',
      pass: 'oqvv hcwv ygza waws'
    }
  });
  
  
  app.post("/register", (req, res) => {
    const { full_name, email, mobile_no, address } = req.body;
    console.log("Received data:", req.body);
  
    const password = Math.floor(1000 + Math.random() * 999999).toString();
  
    const checkDuplicateEmailQuery = "SELECT COUNT(*) AS count FROM register WHERE email = $1";
    const insertQuery = "INSERT INTO register (full_name, email, mobile_no, address, password) VALUES ($1, $2, $3, $4, $5)";
  
    // Check if the email already exists in the database
    pool.query(checkDuplicateEmailQuery, [email], (err, result) => {
      if (err) {
        console.error("Error checking for duplicate email:", err);
        return res.status(500).json({ error: "An error occurred while checking for duplicate email" });
      }
  
      if (result.rows[0].count > 0) {
        // If the email already exists, return an error
        return res.status(400).json({ error: "Email already exists. Please use a different email address." });
      } else {
        // If the email is unique, insert the new record
        const values = [full_name, email, mobile_no, address, password];
        pool.query(insertQuery, values, (insertErr, insertResult) => {
          if (insertErr) {
            console.error("Error inserting record:", insertErr);
            return res.status(500).json({ error: "An error occurred while inserting record" });
          }
  
          // Send email with the generated password
          const mailOptions = {
            from: 'shivarama99666@gmail.com',
            to: email,
            subject: 'Your Password for Registration',
            text: `Dear ${full_name}, Your password for registration is ${password}.`
          };
  
          transporter.sendMail(mailOptions, (mailErr, info) => {
            if (mailErr) {
              console.error("Error sending email:", mailErr);
              return res.status(500).json({ error: "An error occurred while sending email" });
            }
  
            return res.json({ success: true, message: "Registration successful. Password sent to your email." });
          });
        });
      }
    });
  });

app.post("/postExpenseData", (req, res) => {
    const {id, category, product, cost, source, p_date, description, is_tax_app, percentage, tax_amount } = req.body;
    console.log("Received data:", req.body);

    const dateObject = new Date(p_date);
    // const formattedDate = dateObject.toISOString(); 

    const month = dateObject.getMonth() + 1;
    const year = dateObject.getFullYear();
    console.log(month)
    console.log(year)

    const sql = "INSERT INTO expense (category, product, cost, source, p_date, description, is_tax_app, percentage, tax_amount, month, year,user_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10,$11,$12)";
    const values = [category, product, cost, source, p_date, description, is_tax_app, percentage, tax_amount, month, year,id];
    console.log(values)

    pool.query(sql, values, (err, result) => {
        if (err) return res.json(err)
        return res.json(result)
        console.log(result)

    })
})

app.post("/login", (req, res) => {
    const { loginEmail, password } = req.body;
    console.log("Received login request:", req.body);

    const sql = "SELECT * FROM register WHERE email = $1 AND password = $2";

    const values = [loginEmail, password];

    pool.query(sql, values, (err, result) => {
        if (err) {
            console.error("Error executing query:", err);
            return res.status(500).json({ error: "Internal server error" });
        }

        if (!result || result.rows.length === 0) {
            // No matching user found
            return res.status(401).json({ error: "Invalid email or password" });
        }

        const user = result.rows[0];
        if (user.password !== password) {
            // Password doesn't match
            return res.status(401).json({ error: "Invalid email or password" });
        }

        // Login successful
        return res.status(200).json({ message: "Login successful", result: user });
    });
});



app.post('/uploadProfilePicture', (req, res) => {
    
    const { id, imageUrl } = req.body;
    console.log(imageUrl)
    console.log(id)
    
    
    pool.query('UPDATE register SET profile_picture_url = $1 WHERE id = $2', [imageUrl, id], (err, result) => {
        if (err) {
            console.error('Error updating profile picture URL in the database:', err);
            res.sendStatus(500);
        } else {
            console.log('Profile picture URL updated in the database');
            res.sendStatus(200);
        }
    });
});

app.get('/categories/:id', (req, res) => {
    const user_id = req.params.id;
    const sql = `SELECT * FROM category WHERE user_id = ${user_id}`;
    pool.query(sql, (err, data) => {
        if (err) return res.json(err);
        return res.json(data.rows);
    });
});

app.get('/getSource/:id/:month/:year', (req, res) => {
    const user_id = req.params.id;
    const month = parseInt(req.params.month);
    const year = parseInt(req.params.year);
    console.log(month,year)
    // const { month, year } = req.query;
    console.log(user_id)
    // const sql = `SELECT  * FROM source WHERE user_id = ${user_id}`;
    const sql = `SELECT  * FROM source WHERE user_id = $1 AND month =$2 AND year =$3`;
    pool.query(sql, [user_id, month, year] ,(err, data) => {
        // console.log(err);
        // console.log(data);
        if (err) return res.json(err);
        return res.json(data.rows)
    })
})

app.get('/getReportSource/:id/', (req, res) => {
    const user_id = req.params.id; 
    // const { month, year } = req.query;
    console.log(user_id)
    // const sql = `SELECT  * FROM source WHERE user_id = ${user_id}`;
    const sql = `SELECT  * FROM source WHERE user_id = $1`;
    pool.query(sql, [user_id] ,(err, data) => {
        // console.log(err);
        // console.log(data);
        if (err) return res.json(err);
        return res.json(data.rows)
    })
})

app.get('/getSourceData/:id/', (req, res) => {
    const user_id = req.params.id;
    // const { month, year } = req.query;
    console.log(user_id)
    // const sql = `SELECT  * FROM source WHERE user_id = ${user_id}`;
    const sql = `SELECT  * FROM source WHERE user_id = $1 `;
    pool.query(sql, [user_id] ,(err, data) => {
        // console.log(err);
        // console.log(data);
        if (err) return res.json(err);
        return res.json(data.rows)

    })
})

app.get('/getYearWiseData/:id/:year', (req, res) => {
    const user_id = req.params.id;
    const year = parseInt(req.params.year);
  
    // const { month, year } = req.query;
    console.log(user_id)
    // const sql = `SELECT  * FROM source WHERE user_id = ${user_id}`;
    const sql = `SELECT  * FROM source WHERE user_id = $1 AND year = $2`;
    pool.query(sql, [user_id,year] ,(err, data) => {
        // console.log(err);
        // console.log(data);
        if (err) return res.json(err);
        return res.json(data.rows)
    })
})

app.get('/getYearWiseExpenceData/:id/:year', (req, res) => {
    const user_id = req.params.id;
    const year = parseInt(req.params.year)
    const sql = `SELECT * FROM expense  WHERE user_id = ${user_id} And year= ${year}`;
    pool.query(sql, (err, data) => {
        // console.log(err);
        // console.log(data);
        if (err) return res.json(err);
        return res.json(data.rows)
    })
})

app.get('/products', (req, res) => {
    const { category, user_id } = req.query;

    if (!category || !user_id) {
        return res.status(400).json({ error: 'Invalid category or user_id' });
    }

    const sql = 'SELECT * FROM product WHERE category = $1 AND user_id = $2';
    pool.query(sql, [category, user_id], (err, results) => {
        if (err) {
            console.error('Error fetching products:', err);
            return res.status(500).json({ error: 'Internal server error' });
        }
        res.json(results.rows);
        console.log(results);
    });
});

app.get("/filteredSourceData", (req, res) => {
    const month = req.query.month;
    const year = req.query.year;
    const user_id =req.query.user_id;


    const sql = `SELECT Source, SUM(cost) AS totalCost FROM expense WHERE month = $1 AND year = $2 And user_id = $3 GROUP BY Source`;
    pool.query(sql, [month, year,user_id], (err, result) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: "Internal Server Error" });
        }

        return res.json(result.rows);
    });
});

app.get('/getExpenseCost/:id', (req, res) => {
    const user_id = req.params.id;
    const sql = `SELECT * FROM expense  WHERE user_id = ${user_id}`;
    pool.query(sql, (err, data) => {
        // console.log(err);
        // console.log(data);
        if (err) return res.json(err);
        return res.json(data.rows)
    })
})

app.get('/getPhoto/:id', (req, res) => {

    const id = req.params.id;

    const sql = "SELECT profile_picture_url FROM register where id= $1 ";
    pool.query(sql,[id],(err, data) => {
        // console.log(err);
        // console.log(data);
        if (err) return res.json(err);
        return res.json(data)
    })
})


app.listen(3005, () => {
    console.log("listening on 3005")
})

