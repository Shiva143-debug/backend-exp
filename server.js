const express = require('express');
const { Pool } = require('pg');
const cors = require('cors')
const bodyParser = require('body-parser');
const multer = require('multer')
const upload = multer({ dest: 'uploads/' });
const nodemailer = require('nodemailer');
require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');
const appInfo = require('./appInfo.json');

const app = express()
app.use(cors())
app.use(express.json())
app.use(bodyParser.json());


const pool = new Pool({
  user: process.env.PG_USER,
  host: process.env.PG_HOST,
  database: process.env.PG_DATABASE,
  password: process.env.PG_PASSWORD,
  port: process.env.PG_PORT,
  schema: process.env.PG_SCHEMA
});

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: 'shivarama99666@gmail.com',
      pass: 'sdjb lfai xtyx osrx'
    }
  });

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

console.log("Gemini API Key being used:", process.env.GEMINI_API_KEY ? "✅ Loaded" : "❌ Missing");


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
      console.log(result.rows[0].count)
  
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

app.post("/login", (req, res) => {
    const { loginEmail, password } = req.body;
    console.log("Received login request:", req.body);

    const sql = "SELECT * FROM register WHERE email = $1 AND password = $2";

    const values = [loginEmail, password];
    console.log(values)

    pool.query(sql, values, (err, result) => {
        if (err) {
            console.error("Error executing query:", err);
            return res.status(500).json({ error: "Internal server error" });
        }
          
      // console.log(result)
      console.log(result.rows.length)
        if (!result || result.rows.length === 0) {
            // No matching user found
            return res.status(401).json({ error: "Invalid email or password", message: "Login Failure" });
        }

        const user = result.rows[0];
        console.log(user.password)
        console.log(password)
        if (user.password !== password) {
            // Password doesn't match
            return res.status(401).json({ error: "Invalid email or password" , message: "Login Failure"});
        }

        // Login successful
      console.log(res)
        return res.status(200).json({ message: "Login successful", result: user });
      
    });
});

app.post('/chat', async (req, res) => {
    const { prompt } = req.body;
    console.log('Received prompt:', prompt);

    const systemPrompt = `
    You are a helpful assistant for the "Expenditure" app.

    App Details:
    - Name: ${appInfo.name}
    - Description: ${appInfo.description}
    - Features: ${appInfo.features.join(', ')}
    - Tech Stack: ${appInfo.techStack.join(', ')}
    - Created By: ${appInfo.CreatedBy}
    - Date: ${appInfo.Date}

    Instructions:
    You should answer user questions based on the application's structure and behavior.
    Here are some additional module-specific details:

    Authentication:
    - Login: ${appInfo.auth.login}
    - Logout: ${appInfo.auth.logout}

    Expense Module:
    - Description: ${appInfo.ExpenseTab.description}
    - How to Add Expense: ${appInfo.ExpenseTab.howTo.addExpense}

    Common Questions:
    - How to Logout: ${appInfo.howToLogout}
    - How to Add Picture: ${appInfo.howToAddPicture}
    - How to Add Category: ${appInfo.howToAddCategory}
    - How to Add Expense: ${appInfo.howToAddExpense}

    Now, provide clear and helpful answers using this information.

    User: ${prompt}
    `;



    try {
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        console.log('Using model:', model.name);
        const result = await model.generateContent(systemPrompt);
        const response = await result.response;
        const text = response.text();

        console.log('Response from Gemini:', text);
        res.send({ message: text });

    } catch (error) {
        if (error.status === 429) {
            res.status(429).send("Rate limit hit. Try again later or upgrade your Gemini API plan.");
        } else {
            res.status(500).send("Something went wrong: " + error.message);
        }
        // console.error('Error during Gemini API call:', error);
        // res.status(500).send({ error: 'Something went wrong with Gemini API.' });
    }
});


app.post("/addshopcategory", (req, res) => {
    const { id, category } = req.body;
    console.log("category",category)
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

app.put("/updateCategory/:id", (req, res) => {
    const { id } = req.params;
    const { category,user_id } = req.body;
    console.log(id)
    console.log(category)
    console.log(user_id)
    const sqlUpdate = "UPDATE category SET category = $1 WHERE user_id = $2 AND id = $3";

    pool.query(sqlUpdate, [category, user_id, id], (err, result) => {
        if (err) {
            console.error('Error updating category:', err);
            return res.status(500).json({ error: 'Internal server error' });
        }
        if (result.rowCount > 0) {
            return res.json({ message: 'Category updated successfully' });
        } else {
            return res.status(404).json({ message: 'Category not found' });
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

app.put("/updateproduct/:id", (req, res) => {
    const { id } = req.params;  // Get the product ID from the route parameters
    const { product, user_id } = req.body;  // Get updated data from the request body
  console.log(product)
  console.log(id)
  console.log(user_id)

    // SQL query to update the product by ID
 
  const updateProductSql = `
    UPDATE product 
    SET product = $1
    WHERE id = $2 AND user_id = $3
    RETURNING *;  -- This returns the updated row
`;

    // Execute the update query
    pool.query(updateProductSql, [ product, id, user_id], (err, result) => {
        if (err) {
            console.error('Error updating product:', err);
            return res.status(500).json({ error: 'Internal server error' });
        }

        // If the product was successfully updated
        if (result.rowCount > 0) {
            return res.json({
                success: true,
                message: 'Product updated successfully',
                updatedProduct: result.rows[0],  // Return the updated product data
            });
        } else {
            return res.status(404).json({
                success: false,
                message: 'Product not found or user does not have permission to update this product'
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

app.post("/addSavings", (req, res) => {
    const {id, amount, date,note } = req.body;
    console.log("Received data:", req.body);
    const dateObject = new Date(date);
    const Month = dateObject.getMonth() + 1;
    const Year = dateObject.getFullYear();
    console.log(Month)
    console.log(Year)

    const sql = "INSERT INTO savings (user_id, amount, date,note,month,year) VALUES ($1,$2,$3,$4,$5,$6)";
    const values = [id,amount, date,note,Month,Year];
    console.log(values)

    pool.query(sql, values, (err, result) => {
        if (err) return res.json(err)
        return res.json(result)
    })
})

app.post("/adddefaultsource", (req, res) => {
    const {id, sourceName } = req.body;
    console.log("Received data:", req.body);

    const sql = "INSERT INTO sources (user_id,source_name) VALUES ($1,$2)";
    const values = [id,sourceName];
    console.log(values)

    pool.query(sql, values, (err, result) => {
        if (err) return res.json(err)
        return res.json(result)
    })
})

// Update source
app.put("/updateSource/:id", (req, res) => {
    const { id } = req.params;
    const { source, amount, date ,user_id } = req.body;

    const dateObject = new Date(date);
    const Month = dateObject.getMonth() + 1;
    const Year = dateObject.getFullYear();

    const sql = "UPDATE source SET source = $1, amount = $2, date = $3, month = $4, year = $5 WHERE id = $6 AND user_id =$7";
    const values = [source, amount, date, Month, Year, id ,user_id];

    pool.query(sql, values, (err, result) => {
        if (err) {
            console.error('Error updating source:', err);
            return res.status(500).json({ error: "Failed to update source" });
        }
        return res.json({ message: "Source updated successfully", result });
    });
});

app.post("/postExpenseData", (req, res) => {
    const {id, category, product, cost, p_date, description, is_tax_app, percentage, tax_amount,image } = req.body;
    // console.log("Received data:", req.body);

    const dateObject = new Date(p_date);
    // const formattedDate = dateObject.toISOString(); 

    const month = dateObject.getMonth() + 1;
    const year = dateObject.getFullYear();
    // console.log(month)
    // console.log(year)

    const sql = "INSERT INTO expense (category, product, cost, p_date, description, is_tax_app, percentage, tax_amount, month, year,user_id,image) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10,$11,$12)";
    const values = [category, product, cost, p_date, description, is_tax_app, percentage, tax_amount, month, year,id,image];
    console.log(values)

    pool.query(sql, values, (err, result) => {
        if (err) return console.log("error",err)
        return res.json(result)
        console.log(result)

    })
})

app.put("/updateExpense/:id", (req, res) => {
    const { id } = req.params;
    const { user_id, cost, p_date, description, is_tax_app, percentage, tax_amount } = req.body;
    
    // Log received data
    console.log("Updating expense for ID:", id);
    console.log("Received data for update:", req.body);
    
    // Validate input
    const validCost = isNaN(cost) ? 0 : parseFloat(cost);
    const validPercentage = isNaN(percentage) ? 0 : parseInt(percentage);
    const validTaxAmount = isNaN(tax_amount) ? 0 : parseFloat(tax_amount);
    
    const dateObject = new Date(p_date);
    const month = dateObject.getMonth() + 1;
    const year = dateObject.getFullYear();
    
    const sql = `
        UPDATE expense SET 
            cost = $1, 
            p_date = $2, 
            description = $3, 
            is_tax_app = $4, 
            percentage = $5, 
            tax_amount = $6, 
            month = $7, 
            year = $8 
        WHERE user_id = $9 AND id = $10`;

    const values = [validCost, p_date, description, is_tax_app, validPercentage, validTaxAmount, month, year, user_id, id];

    pool.query(sql, values, (err, result) => {
        if (err) {
            console.error("Error updating expense:", err);
            return res.json(err);
        }
        return res.json({ message: "Expense updated successfully" });
    });
});

app.post('/uploadProfilePicture', (req, res) => {
    
    const { id, profile_picture_url } = req.body;
    console.log(profile_picture_url)
    console.log(id)
    
    
    pool.query('UPDATE register SET profile_picture_url = $1 WHERE id = $2', [profile_picture_url, id], (err, result) => {
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
    const sql = `SELECT * FROM category WHERE user_id = ${user_id} or user_id =0 `;
    pool.query(sql, (err, data) => {
        if (err) return res.json(err);
        return res.json(data.rows);
    });
});

app.get('/savings/:id', (req, res) => {
    const user_id = req.params.id;
    const sql = `SELECT * FROM savings WHERE user_id = ${user_id} order by date desc`;
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

app.get('/getSavings/:id/:month/:year', (req, res) => {
    const user_id = req.params.id;
    const month = parseInt(req.params.month);
    const year = parseInt(req.params.year);
    console.log(month,year)
    // const { month, year } = req.query;
    console.log(user_id)
    // const sql = `SELECT  * FROM source WHERE user_id = ${user_id}`;
    const sql = `SELECT  * FROM savings WHERE user_id = $1 AND month =$2 AND year =$3`;
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
    console.log(user_id)
    // const sql = `SELECT  * FROM source WHERE user_id = ${user_id}`;
    const sql = `SELECT  * FROM source WHERE user_id = $1 order by id desc`;
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

app.get('/getYearWiseSavingsData/:id/:year', (req, res) => {
    const user_id = req.params.id;
    const year = parseInt(req.params.year)
    console.log("user_id",user_id)
   console.log("year",year)
    const sql = `SELECT * FROM savings  WHERE user_id = ${user_id} And year= ${year}`;
    pool.query(sql, (err, data) => {
        console.log(err);
        console.log(data);
        if (err) return res.json(err);
        return res.json(data.rows)
    })
})

app.get('/products', (req, res) => {
    const { category, user_id } = req.query;
   

    if (!category || !user_id) {
        return res.status(400).json({ error: 'Invalid category or user_id' });
    }

    const sql = 'SELECT * FROM product WHERE category = $1 AND (user_id = $2 or user_id = 0)';
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

app.get('/getExpenseCostByItemId/:id/:itemId', (req, res) => {
    const user_id = req.params.id;
    const itemId = req.params.itemId;
    console.log(user_id)
    console.log(itemId)
    const sql = `SELECT * FROM expense  WHERE user_id = ${user_id} and id = ${itemId}`;
    pool.query(sql, (err, data) => {
        // console.log(err);
        // console.log(data);
        if (err) return res.json(err);
        return res.json(data.rows[0])
    })
})

app.get('/getPhoto/:id', (req, res) => {

    const id = req.params.id;

    const sql = "SELECT profile_picture_url FROM register where id= $1 ";
    pool.query(sql,[id],(err, data) => {
        // console.log(err);
        // console.log(data);
        if (err) return res.json(err);
        return res.json(data.rows)
    })
})

app.get('/getCategoriesAndProducts/:id', (req, res) => {
    const user_id = req.params.id;
    const sql = `SELECT * FROM product WHERE user_id = ${user_id} or user_id =0`;
    pool.query(sql, (err, data) => {
        if (err) return res.json(err);
        return res.json(data.rows);
    });
});

app.get('/getdefaultsources/:id', (req, res) => {
    const user_id = req.params.id;
    const sql = `SELECT * FROM sources WHERE user_id = ${user_id} or user_id = 0`;
    pool.query(sql, (err, data) => {
        if (err) return res.json(err);
        return res.json(data.rows);
    });
});

app.get('/getCategories/:id', (req, res) => {
    const user_id = req.params.id;
    const sql = `SELECT * FROM category
    WHERE user_id = ${user_id} or user_id =0 `;
    pool.query(sql, (err, data) => {
        if (err) return res.json(err);
        return res.json(data.rows);
    });
});

app.delete('/deleteProducts/:item_id/:user_id', (req, res) => {
  const item_id = parseInt(req.params.item_id);
  const user_id = parseInt(req.params.user_id);

  // const sql = "DELETE FROM items1 WHERE `itemId`=?";
  const sql = "DELETE FROM product WHERE id=$1 AND user_id=$2";
  pool.query(sql, [item_id,user_id], (err, data) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ message: 'Internal Server Error' });
    }

    return res.json(data);
  });

});

app.delete('/deleteCategories/:item_id/:user_id', (req, res) => {
  const item_id = parseInt(req.params.item_id);
  const user_id = parseInt(req.params.user_id);

  // const sql = "DELETE FROM items1 WHERE `itemId`=?";
  const sql = "DELETE FROM category WHERE id=$1 AND user_id=$2";
  pool.query(sql, [item_id,user_id], (err, data) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ message: 'Internal Server Error' });
    }

    return res.json(data);
  });

});

app.delete('/deleteExpence/:item_id/:user_id', (req, res) => {
  const item_id = parseInt(req.params.item_id);
  const user_id = parseInt(req.params.user_id);

  // const sql = "DELETE FROM items1 WHERE `itemId`=?";
  const sql = "DELETE FROM expense WHERE id=$1 AND user_id=$2";
  pool.query(sql, [item_id,user_id], (err, data) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ message: 'Internal Server Error' });
    }

    return res.json(data);
  });

});

app.delete('/deleteSource/:item_id/:user_id', (req, res) => {
  const item_id = parseInt(req.params.item_id);
  const user_id = parseInt(req.params.user_id);
   console.log(item_id,user_id)

  // const sql = "DELETE FROM items1 WHERE `itemId`=?";
  const sql = "DELETE FROM source WHERE id=$1 AND user_id=$2";
  pool.query(sql, [item_id,user_id], (err, data) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ message: 'Internal Server Error' });
    }

    return res.json(data);
  });

});

app.delete('/savings/:item_id/:user_id', (req, res) => {
  const item_id = parseInt(req.params.item_id);
  const user_id = parseInt(req.params.user_id);
  console.log(item_id,user_id)

  // const sql = "DELETE FROM items1 WHERE `itemId`=?";
  const sql = "DELETE FROM savings WHERE id=$1 AND user_id=$2";
  pool.query(sql, [item_id,user_id], (err, data) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ message: 'Internal Server Error' });
    }

    return res.json(data);
  });

});


app.put('/updateUserPassword', (req, res) => {
  const { email, updatedpassword,updatedConfirmpassword } = req.body;

  // Validate inputs
  if (!email || !updatedpassword) {
      return res.status(400).json({ error: 'Email and updated password are required' });
  }

  // Update the user's password in the database
  const sql = "UPDATE register SET password = $1 WHERE email = $2";
  pool.query(sql, [updatedpassword, email], (err, result) => {
      if (err) {
          console.error("Error updating password:", err);
          return res.status(500).json({ error: "An error occurred while updating password" });
      }

      if (result.affectedRows === 0) {
          return res.status(404).json({ error: "User not found" });
      }

      return res.status(200).json({ message: "Password updated successfully" });
    
  });
});


app.listen(process.env.PORT || 4000,()=>console.log("server on "+process.env.PORT))
