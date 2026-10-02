require('dotenv').config();

const express = require('express');
const { Pool } = require('pg');
const cors = require('cors')
const multer = require('multer')
const { GoogleGenAI } = require('@google/genai');
const { generateToken, authenticateToken } = require('./middleware/auth');
const camelCaseResponse = require('./middleware/camelCase');
const upload = multer({ dest: 'uploads/' });
const bodyParser = require('body-parser');
const appInfo = require('./appInfo.json');
const incomeRoutes = require('./routes/incomeRoutes');
const savingsRoutes = require('./routes/savingsRoutes');
const expenseRoutes = require('./routes/expenseRoutes');
const agentRoutesNew = require('./routes/agentRoutesNew');
const categoryRoutes = require("./routes/categoryRoutes");
const { success, failure } = require('./utils/response');
const { sendMail } = require('./services/emailService');


const app = express()
app.use(cors())
app.use(express.json())
app.use(bodyParser.json())
app.use(camelCaseResponse);


const isLocalDB = !process.env.DATABASE_URL || process.env.DATABASE_URL.includes('localhost') || process.env.DATABASE_URL.includes('127.0.0.1');
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DB_SSL === 'false' || isLocalDB ? false : { rejectUnauthorized: false },
});

const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY, // from your .env
});

console.log("Gemini API Key being used:", process.env.GEMINI_API_KEY ? "✅ Loaded" : "❌ Missing");

// Register User (web ,mobile)
app.post("/register", async (req, res) => {
    const { fullName, email, mobileNo, address } = req.body;
    const password = Math.floor(100000 + Math.random() * 900000).toString();

    const client = await pool.connect();

    try {
        const dupCheck = await client.query(
            "SELECT 1 FROM register WHERE email = $1",
            [email]
        );
        if (dupCheck.rowCount > 0)
            return failure(res, "Email exists", 400);

        await client.query("BEGIN");
        await client.query(
            "INSERT INTO register (full_name, email, mobile_no, address, password) VALUES ($1,$2,$3,$4,$5)",
            [fullName, email, mobileNo, address, password]
        );

        // Send email via OAuth2
        // await sendMail(
        //     email,
        //     "Your Password for Registration",
        //     `Dear ${fullName}, your password is ${password}`
        // );

        await client.query("COMMIT");

        return success(res, "Registration successful. Password sent to email.");
    } catch (err) {
        await client.query("ROLLBACK");
        console.error("Register error:", err);
        return failure(res, "Registration failed", 500);
    } finally {
        client.release();
    }
});

// Login User (web ,mobile)
app.post("/login", (req, res) => {
    const { loginEmail, password } = req.body;
    console.log("Received login request:", req.body);

    const sql = "SELECT * FROM register WHERE email = $1 AND password = $2";

    const values = [loginEmail, password];
    console.log(values)

    pool.query(sql, values, (err, result) => {
        if (err) {
            console.error("Error executing query:", err);
            return failure(res, "Internal server error", 500);
        }

        // console.log(result)
        console.log(result.rows.length)
        if (!result || result.rows.length === 0) {
            // No matching user found
            return failure(res, "Invalid email or password", 401);
        }

        const user = result.rows[0];
        console.log(user.password)
        console.log(password)
        if (user.password !== password) {
            // Password doesn't match
            return failure(res, "Invalid email or password", 401);
        }

        // Login successful - generate JWT token
        const token = generateToken(user);
        return success(res, "Login successful", { user, token });

    });
});

// Stats (web ,mobile)
app.get('/get-stats/:month/:year', authenticateToken, async (req, res) => {
    const month = parseInt(req.params.month);
    const year = parseInt(req.params.year);

    if (!Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(year) || year < 1) {
        return failure(res, 'month and year are required and must be valid', 400);
    }

    const userId = req.user.id;
    const sql = `
        SELECT
            COALESCE((
                SELECT SUM(amount)
                FROM incomes
                WHERE user_id = $1 AND month = $2 AND year = $3
            ), 0) AS income_amount,
            COALESCE((
                SELECT SUM(cost)
                FROM expense
                WHERE user_id = $1 AND month = $2 AND year = $3
            ), 0) AS expense_amount,
            COALESCE((
                SELECT SUM(tax_amount)
                FROM expense
                WHERE user_id = $1 AND month = $2 AND year = $3
            ), 0) AS tax_amount,
            COALESCE((
                SELECT COUNT(*)
                FROM expense
                WHERE user_id = $1 AND month = $2 AND year = $3
            ), 0) AS expense_count,
            COALESCE((
                SELECT COUNT(DISTINCT COALESCE(c.category, 'Uncategorized'))
                FROM expense e
                LEFT JOIN category c ON c.id = e.category_id
                WHERE e.user_id = $1 AND e.month = $2 AND e.year = $3
            ), 0) AS category_count,
            COALESCE((
                SELECT SUM(amount)
                FROM savings
                WHERE user_id = $1 AND month = $2 AND year = $3
            ), 0) AS savings_amount
    `;

    try {
        const result = await pool.query(sql, [userId, month, year]);

        return success(res, "Stats fetched successfully", result.rows[0]);
    } catch (err) {
        console.error("Error fetching stats:", err);
        return failure(res, "Failed to fetch stats", 500);
    }
});

//stats for year (web)
app.get('/get-stats-year/:year', authenticateToken, async (req, res) => {
    const year = Number(req.params.year);

    if (!Number.isInteger(year) || year < 1) {
        return failure(res, 'year is required and must be valid', 400);
    }

    const userId = req.user.id;
    const sql = `
        SELECT
            COALESCE((
                SELECT SUM(amount)
                FROM incomes
                WHERE user_id = $1 AND year = $2
            ), 0) AS income_amount,
            COALESCE((
                SELECT SUM(cost)
                FROM expense
                WHERE user_id = $1 AND year = $2
            ), 0) AS expense_amount,
            COALESCE((
                SELECT SUM(tax_amount)
                FROM expense
                WHERE user_id = $1 AND year = $2
            ), 0) AS tax_amount,
            COALESCE((
                SELECT COUNT(*)
                FROM expense
                WHERE user_id = $1 AND year = $2
            ), 0) AS expense_count,
            COALESCE((
                SELECT COUNT(DISTINCT COALESCE(c.category, 'Uncategorized'))
                FROM expense e
                LEFT JOIN category c ON c.id = e.category_id
                WHERE e.user_id = $1 AND e.year = $2
            ), 0) AS category_count,
            COALESCE((
                SELECT SUM(amount)
                FROM savings
                WHERE user_id = $1 AND year = $2
            ), 0) AS savings_amount
    `;

    try {
        const result = await pool.query(sql, [userId, year]);

        return success(res, "Yearly stats fetched successfully", result.rows[0]);
    } catch (err) {
        console.error("Error fetching yearly stats:", err);
        return failure(res, "Failed to fetch yearly stats", 500);
    }
});









// Chatbot (not implemetd yet in web,mobile)
app.post('/chat', async (req, res) => {
    const { prompt } = req.body;
    console.log('Received prompt:', prompt);

    const systemPrompt = `
    You are a helpful, intelligent assistant. You can answer questions both about the application below and general topics using your broader knowledge.

    App Details:
    - Name: ${appInfo.name}
    - Description: ${appInfo.description}
    - Features: ${appInfo.features.join(', ')}
    - Tech Stack: ${appInfo.techStack.join(', ')}
    - Created By: ${appInfo.CreatedBy}
    - Date: ${appInfo.Date}

    Module-Specific Info:
    Authentication:
    - Login: ${appInfo.auth.login}
    - Logout: ${appInfo.auth.logout}

    Expense Module:
    - Description: ${appInfo.ExpenseTab.description}
    - How to Add Expense: ${appInfo.ExpenseTab.howTo.addExpense}

    FAQs:
    - How to Logout: ${appInfo.howToLogout}
    - How to Add Picture: ${appInfo.howToAddPicture}
    - How to Add Category: ${appInfo.howToAddCategory}
    - How to Add Expense: ${appInfo.howToAddExpense}

    Instructions:
    You can answer user queries related to the application above and any other general topics (e.g., locations, history, technology, etc.). If you are unsure, respond gracefully.

    User: ${prompt}
    `;


    try {
        const model = ai.getGenerativeModel({ model: "gemini-1.5-flash" });
        console.log('Using model:', model.name);
        const result = await model.generateContent(systemPrompt);
        const response = await result.response;
        const text = response.text();

        console.log('Response from Gemini:', text);
        success(res, "Success", { message: text });

    } catch (error) {
        if (error.status === 429) {
            failure(res, "Rate limit hit. Try again later or upgrade your Gemini API plan.", 429);
        } else {
            failure(res, "Something went wrong: " + error.message, 500);
        }
        // console.error('Error during Gemini API call:', error);
        // res.status(500).send({ error: 'Something went wrong with Gemini API.' });
    }
});

//profile screen removed in both web,mobile, so not needed
app.post('/uploadProfilePicture', authenticateToken, (req, res) => {

    const { profile_picture_url } = req.body;
    const userId = req.user.id;
    console.log(profile_picture_url)
    console.log(userId)


    pool.query('UPDATE register SET profile_picture_url = $1 WHERE id = $2', [profile_picture_url, userId], (err, result) => {
        if (err) {
            console.error('Error updating profile picture URL in the database:', err);
            failure(res, "Failed to update profile picture", 500);
        } else {
            console.log('Profile picture URL updated in the database');
            success(res, "Profile picture updated successfully");
        }
    });
});
//profile screen removed in both web,mobile, so not needed
app.get('/getPhoto', authenticateToken, (req, res) => {

    const userId = req.user.id;

    const sql = "SELECT profile_picture_url FROM register where id= $1 ";
    pool.query(sql, [userId], (err, data) => {
        // console.log(err);
        // console.log(data);
        if (err) return failure(res, "Failed to fetch photo", 500);
        return success(res, "Photo fetched successfully", data.rows);
    })
})

//update password feature is not implemented in both web,mobile.
app.put('/updateUserPassword', authenticateToken, (req, res) => {
    const { email, updatedpassword, updatedConfirmpassword } = req.body;

    // Validate inputs
    if (!email || !updatedpassword) {
        return failure(res, 'Email and updated password are required', 400);
    }

    // Update the user's password in the database
    const sql = "UPDATE register SET password = $1 WHERE email = $2";
    pool.query(sql, [updatedpassword, email], (err, result) => {
        if (err) {
            console.error("Error updating password:", err);
            return failure(res, "An error occurred while updating password", 500);
        }

        if (result.affectedRows === 0) {
            return failure(res, "User not found", 404);
        }

        return success(res, "Password updated successfully");

    });
});

//swio APP
app.post('/create-payment', async (req, res) => {
    const { name, amount, transaction } = req.body;

    try {
        // Create a PaymentIntent with the payment method ID
        // const paymentIntent = await stripe.paymentIntents.create({
        //     amount: amount * 100, // amount in cents
        //     currency: 'usd',
        //     payment_method: 'card',
        //     confirmation_method: 'manual',
        //     confirm: true,
        // });

        // If paymentIntent is successful, insert data into the payment table
        const sql = "INSERT INTO payment (name,amount,transaction) VALUES ($1, $2, $3)";
        const values = [name, amount, transaction];
        console.log("Inserting values into payment table:", values);

        pool.query(sql, values, (err, result) => {
            if (err) {
                console.error("Error inserting data into payment table:", err);
                return failure(res, "Error inserting data into payment table", 500);
            }
            console.log("Data inserted successfully into payment table");
            return success(res, "Data inserted successfully");
        });
    } catch (error) {
        console.error("Error creating PaymentIntent:", error);
        return failure(res, "Error creating PaymentIntent", 500);
    }
});

//swio APP
app.get('/getpayment', (req, res) => {
    const sql = "SELECT  * FROM payment";
    pool.query(sql, (err, data) => {
        if (err) return failure(res, "Failed to fetch payments", 500);
        return success(res, "Payments fetched successfully", data.rows);
    });
});


// ── Protected routes (require JWT) ──
app.use('/', authenticateToken, incomeRoutes(pool));
app.use('/', authenticateToken, savingsRoutes(pool));
app.use('/', authenticateToken, expenseRoutes(pool, upload));
app.use('/', authenticateToken, agentRoutesNew(ai, pool));
app.use("/", authenticateToken, categoryRoutes(pool));

const PORT = process.env.PORT || 4000;
app.listen(PORT, '0.0.0.0', () => console.log('server on', PORT));

// app.listen(process.env.PORT || 4000, () => console.log("server on " + process.env.PORT))
