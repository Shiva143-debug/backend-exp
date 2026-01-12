const express = require('express');
const { Pool } = require('pg');
const cors = require('cors')
const bodyParser = require('body-parser');
const multer = require('multer')
const upload = multer({ dest: 'uploads/' });
const nodemailer = require('nodemailer');
require('dotenv').config();
// const { GoogleGenerativeAI } = require('@google/generative-ai');
const { GoogleGenAI } = require('@google/genai');
const appInfo = require('./appInfo.json');

const incomeRoutes = require('./routes/incomeRoutes');
const savingsRoutes = require('./routes/savingsRoutes');
const expenseRoutes = require('./routes/expenseRoutes');
const agentRoutesNew = require('./routes/agentRoutesNew');
const categoryRoutes = require("./routes/categoryRoutes");


const app = express()
app.use(cors())
app.use(express.json())
app.use(bodyParser.json());


const pool = new Pool({
    user: 'oss_admin',
    host: '148.72.246.179',
    database: 'expense',
    password: 'Latitude77',
    schema: "public",
    port: '5432',
});


// const pool = new Pool({
//   user: process.env.PG_USER,
//   host: process.env.PG_HOST,
//   database: process.env.PG_DATABASE,
//   password: process.env.PG_PASSWORD,
//   schema: process.env.PG_SCHEMA,
//   port: process.env.PG_PORT
// });
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'shivarama99666@gmail.com',
        pass: 'sdjb lfai xtyx osrx'
    }
});

// const genAI = new GoogleGenerativeAI("AIzaSyDWxhXDe4CFJy01gt2lmJHGrEw8zT2ocNA");
const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY, // from your .env
});

console.log("Gemini API Key being used:", process.env.GEMINI_API_KEY ? "✅ Loaded" : "❌ Missing");


app.use('/', incomeRoutes(pool));
app.use('/', savingsRoutes(pool));
app.use('/', expenseRoutes(pool, upload));
app.use('/', agentRoutesNew(ai, pool));
app.use("/", categoryRoutes(pool));


app.post("/register", async (req, res) => {
  const { full_name, email, mobile_no, address } = req.body;
  const password = Math.floor(100000 + Math.random() * 900000).toString();

  const client = await pool.connect();

  try {
    // 🔹 Check duplicate email
    const dupCheck = await client.query(
      "SELECT 1 FROM register WHERE email = $1",
      [email]
    );

    if (dupCheck.rowCount > 0) {
      return res.status(400).json({
        success: false,
        message: "Email already exists"
      });
    }

    // 🔹 Begin transaction
    await client.query("BEGIN");

    // 🔹 Insert user
    await client.query(
      "INSERT INTO register (full_name, email, mobile_no, address, password) VALUES ($1, $2, $3, $4, $5)",
      [full_name, email, mobile_no, address, password]
    );

    // 🔹 Prepare email
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: "Your Password for Registration",
      text: `Dear ${full_name}, your password is ${password}`
    };

    // 🔹 Send email
    await transporter.sendMail(mailOptions);

    // ✅ Commit ONLY if email succeeds
    await client.query("COMMIT");

    return res.json({
      success: true,
      message: "Registration successful. Password sent to email."
    });

  } catch (err) {
    // ❌ Rollback on ANY failure
    await client.query("ROLLBACK");
    console.error("Register error:", err);

    return res.status(500).json({
      success: false,
      message: "Registration failed. Please try again."
    });

  } finally {
    client.release();
  }
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
            return res.status(401).json({ error: "Invalid email or password", message: "Login Failure" });
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

app.get('/getPhoto/:id', (req, res) => {

    const id = req.params.id;

    const sql = "SELECT profile_picture_url FROM register where id= $1 ";
    pool.query(sql, [id], (err, data) => {
        // console.log(err);
        // console.log(data);
        if (err) return res.json(err);
        return res.json(data.rows)
    })
})

app.put('/updateUserPassword', (req, res) => {
    const { email, updatedpassword, updatedConfirmpassword } = req.body;

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



const PORT = process.env.PORT || 4000;
app.listen(PORT, '0.0.0.0', () => console.log('server on', PORT));

// app.listen(process.env.PORT || 4000, () => console.log("server on " + process.env.PORT))
