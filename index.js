import express from "express";
import cors from 'cors';
import dotenv from 'dotenv';
import pg from 'pg';
import bodyParser from "body-parser";
import bcrypt from 'bcryptjs';

const app = express();
dotenv.config();
app.use(express.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.urlencoded({ extended: true }));
app.use(cors());


const db = new pg.Client({
    user: process.env.PG_USER,
    host: process.env.PG_HOST,
    database: process.env.PG_DATABASE,
    password: process.env.PG_PASSWORD,
    port: process.env.PG_PORT,
});
db.connect();

app.post("/api/auth/login", async(req, res) => {
    const email = req.body.username;
    const password = req.body.password;

    if (!email || !password) {
        return res.status(400).json({ message: "Email and password are required" });
    }

    try {
        const result = await db.query(
            "SELECT * FROM users WHERE email = $1 AND password = $2", [email, password]
        );

        if (result.rows.length > 0) {
            res.json({ message: "Login successful", user: result.rows[0] });
        } else {
            res.status(401).json({ message: "Invalid credentials" });
        }
    } catch (error) {
        console.error("Login error:", error);
        res.status(500).json({ message: "Server error" });
    }
});


app.post("/api/auth/logout", (req, res) => {
    res.send("User logged out");
});

app.post("/api/auth/forgot-password", (req, res) => {
    res.send("Password reset link sent");
});


app.get("/api/users", (req, res) => {
    res.send("List of all users");
});

app.get("/api/users/:id", (req, res) => {
    res.send(`User details for ID ${req.params.id}`);
});

app.put("/api/users/:id", (req, res) => {
    res.send(`User ${req.params.id} updated`);
});

app.delete("/api/users/:id", (req, res) => {
    res.send(`User ${req.params.id} deleted`);
});


app.get("/api/accounts/:id", (req, res) => {
    res.send(`Account details for user ${req.params.id}`);
});

app.post("/api/accounts", (req, res) => {
    res.send("New bank account created");
});

app.put("/api/accounts/:id", (req, res) => {
    res.send(`Account ${req.params.id} updated`);
});



app.post("/api/transactions", (req, res) => {
    res.send("Transaction processed");
});

app.get('/api/transactions', async(req, res, next) => {
    try {
        const { id } = req.query;
        const { limit, offset, sort } = req.query;
        const transactionsQuery = `
            SELECT * FROM transactions
            WHERE sender_account_id = $1 OR receiver_account_id = $1
            ORDER BY created_at ${sort === 'DESC' ? 'DESC' : 'ASC'}
            LIMIT $2 OFFSET $3`;
        const countQuery = `
            SELECT COUNT(*) FROM transactions
            WHERE sender_account_id = $1 OR receiver_account_id = $1`;
        const transactionsResult = await db.query(transactionsQuery, [id, limit, offset]);
        const countResult = await db.query(countQuery, [id]);
        res.status(200).json({ success: true, count: parseInt(countResult.rows[0].count), data: transactionsResult.rows });
    } catch (error) {
        next(error);
    }
});

app.post("/api/cards/request", async(req, res) => {
    try {
        const email = req.body.username;
        const cardType = req.body.cardType;

        if (!email || !cardType) {
            return res.status(400).json({ error: "Email and card type are required." });
        }

        // Insert request into the database
        const result = await db.query(
            "INSERT INTO card_requests (email, card_type, status) VALUES ($1, $2, 'pending') RETURNING *", [email, cardType]
        );

        res.status(201).json({ message: "Card request submitted successfully", request: result.rows[0] });
    } catch (error) {
        console.error("Error requesting card:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});


app.get("/api/cards/:userId", async(req, res) => {
    res.send(`Bank cards for user ${req.params.userId}`);
    const email = req.body.username; // Always use this

    if (!email) {
        return res.status(400).json({ message: "Email is required." });
    }

    try {
        // Get user ID
        const userResult = await db.query("SELECT id FROM users WHERE email = $1", [email]);
        if (userResult.rows.length === 0) {
            return res.status(404).json({ message: "User not found." });
        }

        const userId = userResult.rows[0].id;

        // Fetch the user's cards
        const cards = await db.query("SELECT * FROM cards WHERE user_id = $1", [userId]);

        res.status(200).json(cards.rows);
    } catch (error) {
        console.error("Error fetching cards:", error);
        res.status(500).json({ message: "Server error. Please try again later." });
    }
});


app.get("/api/admin/users", (req, res) => {
    res.send("Admin: List of all users");
});

app.put("/api/admin/cards/:cardId", (req, res) => {
    res.send(`Card request ${req.params.cardId} updated`);
});



// Change Password
app.post('/api/auth/change-password', async(req, res, next) => {
    try {
        const { email, currentPassword, newPassword } = req.body;
        const result = await db.query('SELECT * FROM users WHERE email = $1', [email]);
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }
        const user = result.rows[0];
        const isMatch = await bcrypt.compare(currentPassword, user.password_hash);
        if (!isMatch) {
            return res.status(401).json({ success: false, message: 'Current password is incorrect' });
        }
        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(newPassword, salt);
        await db.query('UPDATE users SET password_hash = $1, first_login = false WHERE email = $2', [passwordHash, email]);
        res.status(200).json({ success: true, message: 'Password updated successfully' });
    } catch (error) {
        next(error);
    }
});

// Forgot Password
app.post('/api/auth/forgot-password', async(req, res, next) => {
    try {
        const { email } = req.body;
        const result = await db.query('SELECT * FROM users WHERE email = $1', [email]);
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'No user found with that email' });
        }
        res.status(200).json({ success: true, message: 'Password reset requested' });
    } catch (error) {
        next(error);
    }
});

// Reset Password
app.post('/api/auth/reset-password', async(req, res, next) => {
    try {
        const { email, password } = req.body;
        const result = await db.query('SELECT * FROM users WHERE email = $1', [email]);
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }
        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(password, salt);
        await db.query('UPDATE users SET password_hash = $1, first_login = false WHERE email = $2', [passwordHash, email]);
        res.status(200).json({ success: true, message: 'Password reset successful' });
    } catch (error) {
        next(error);
    }
});
const port = 3000;
app.listen(port, () => {
    console.log(`server runs on ${port}`);
})