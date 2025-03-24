import express from "express";
import cors from 'cors';
import dotenv from 'dotenv';
import pg from 'pg';
import bodyParser from "body-parser";
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import path from 'path';
import { fileURLToPath } from "url";

const app = express();
dotenv.config();
app.use(express.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.urlencoded({ extended: true }));
app.use(cors());


const __filename = fileURLToPath(
    import.meta.url);
const __dirname = path.dirname(__filename);
app.use(express.static(path.join(__dirname, "public")));
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "home.html"));
});


const generateToken = (userId, isAdmin) => {
    return jwt.sign({ id: userId, isAdmin },
        process.env.JWT_SECRET, { expiresIn: '1h' }
    );
};

app.post("/api/auth/register", async(req, res) => {

    const { firstname, email, phone, password } = req.body;

    if (!firstname || !email || !phone || !password) {
        return res.status(400).json({ message: "All fields are required!" });
    }

    try {
       
        const userCheck = await db.query("SELECT * FROM users WHERE email = $1", [email]);

        if (userCheck.rows.length > 0) {
          
            return res.status(400).json({ message: "Email already exists" });
        }

     
        const hashedPassword = await bcrypt.hash(password, 10);

        await db.query(
            "INSERT INTO users (firstname, email, phonenumber, passwordhash) VALUES ($1, $2, $3, $4)", [firstname, email, phone, hashedPassword]
        );

     
        res.status(201).json({ message: "User registered successfully!" });

    } catch (error) {
        console.error("Error registering user:", error);
        res.status(500).json({ message: "Server error" });
    }
});

app.post("/api/auth/login", async(req, res) => {
    const { email, password } = req.body;

    try {
       
        const user = await db.query('SELECT * FROM users WHERE email = $1', [email]);

        if (user.rows.length === 0) {
            return res.status(404).json({ message: "User not found" });
        }

       
        const isMatch = await bcrypt.compare(password, user.rows[0].password);

        if (!isMatch) {
            return res.status(400).json({ message: "Invalid credentials" });
        }

        const token = jwt.sign({ email: user.rows[0].email, id: user.rows[0].id },
            process.env.JWT_SECRET, { expiresIn: "1h" }
        );

    
        res.json({ message: "Login successful", token });

    } catch (error) {
        console.error("Error logging in:", error);
        res.status(500).json({ message: "Server error" });
    }
});
const authenticate = (req, res, next) => {
    const token = req.header('Authorization');
    if (!token) return res.status(401).json({ success: false, message: 'Access denied' });
    try {
        const decoded = jwt.verify(token.split(' ')[1], process.env.JWT_SECRET);
        req.user = decoded;
        next();
    } catch (error) {
        res.status(400).json({ success: false, message: 'Invalid token' });
    }
};
const db = new pg.Client({
    user: process.env.PG_USER,
    host: process.env.PG_HOST,
    database: process.env.PG_DATABASE,
    password: process.env.PG_PASSWORD,
    port: process.env.PG_PORT,
});
db.connect();

app.post("/api/auth/login", async(req, res) => {
    const { email, password } = req.body;

    try {
        const user = await db.query("SELECT * FROM users WHERE email = $1", [email]);
        if (user.rows.length === 0) {
            return res.status(404).json({ message: "User not found" });
        }

        const isMatch = await bcrypt.compare(password, user.rows[0].password);
        if (!isMatch) {
            return res.status(400).json({ message: "Invalid credentials" });
        }

        const token = jwt.sign({ email: user.rows[0].email }, process.env.JWT_SECRET, { expiresIn: "1h" });

        res.json({ message: "Login successful", token });
    } catch (error) {
        console.error("Error logging in:", error);
        res.status(500).json({ message: "Server error" });
    }
});



app.get('/api/accounts', authenticate, async(req, res) => {
    try {
        const result = await db.query('SELECT id, accountnumber, account_type, balance, status, created_at FROM accounts WHERE userid = $1 ORDER BY created_at DESC', [req.user.id]);
        res.status(200).json({ accounts: result.rows });
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

app.get("/dashboard/:userId", async(req, res) => {
    const { userId } = req.params;

    try {
        
        const accountQuery = `
            SELECT id, accountNumber, balance FROM Account WHERE userId = $1 LIMIT 1;
        `;
        const accountResult = await db.query(accountQuery, [userId]);

        if (accountResult.rows.length === 0) {
            return res.status(404).json({ message: "Account not found" });
        }

        const account = accountResult.rows[0];
        const transactionsQuery = `
            SELECT senderAccountId, receiverAccountId, amount, transactionType, description, createdAt
            FROM Transaction 
            WHERE senderAccountId = $1 OR receiverAccountId = $1
            ORDER BY createdAt DESC
            LIMIT 5;
        `;
        const transactionsResult = await db.query(transactionsQuery, [account.id]);

        res.json({
            accountNumber: account.accountnumber,
            balance: account.balance,
            transactions: transactionsResult.rows,
        });
    } catch (error) {
        console.error("Error fetching dashboard data:", error);
        res.status(500).json({ message: "Server error" });
    }
});

app.get('/api/accounts/:id', authenticate, async(req, res) => {
    try {
        const result = await db.query('SELECT id, accountnumber, account_type, balance, status, created_at FROM accounts WHERE id = $1 AND userid = $2', [req.params.id, req.user.id]);
        if (result.rows.length === 0) return res.status(404).json({ error: 'Account not found' });
        res.status(200).json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
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


app.get('/api/cards/requests', authenticate, async(req, res) => {
    try {
        const result = await db.query('SELECT * FROM card_requests WHERE email = $1', [req.user.email]);
        res.status(200).json(result.rows);
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});


app.post("/api/cards/request", authenticate, async(req, res) => {
    try {
        const email = req.user.email;
        const cardType = req.body.cardType;

        if (!cardType) {
            return res.status(400).json({ error: "Card type is required." });
        }

        const result = await db.query(
            "INSERT INTO card_requests (email, card_type, status) VALUES ($1, $2, 'pending') RETURNING *", [email, cardType]
        );

        res.status(201).json({ message: "Card request submitted successfully", request: result.rows[0] });
    } catch (error) {
        console.error("Error requesting card:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});


app.delete('/api/cards/requests/:requestId', authenticate, async(req, res) => {
    try {
        const result = await db.query('DELETE FROM card_requests WHERE id = $1 AND email = $2 RETURNING *', [req.params.requestId, req.user.email]);
        if (result.rowCount === 0) return res.status(404).json({ error: 'Request not found or already processed' });
        res.status(200).json({ message: 'Card request canceled' });
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});


app.get("/api/cards/:userId", authenticate, async(req, res) => {
    try {
        
        const userId = req.user.id;

     
        const cards = await db.query("SELECT * FROM cards WHERE userid = $1", [userId]);

        res.status(200).json(cards.rows);
    } catch (error) {
        console.error("Error fetching cards:", error);
        res.status(500).json({ message: "Server error. Please try again later." });
    }
});



app.put('/api/cards/:cardId/status', authenticate, async(req, res) => {
    const { status } = req.body;
    if (!['active', 'inactive'].includes(status)) return res.status(400).json({ error: 'Invalid status' });

    try {
        const result = await db.query('UPDATE cards SET status = $1 WHERE id = $2 AND userid = $3 RETURNING *', [status, req.params.cardId, req.user.id]);
        if (result.rowCount === 0) return res.status(404).json({ error: 'Card not found' });
        res.status(200).json({ message: `Card ${status} successfully` });
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

app.get("/api/admin/users", authenticate, async(req, res) => {
    try {
        
        if (!req.user.isAdmin) {
            return res.status(403).json({ error: "Access denied. Admins only." });
        }

      
        const result = await db.query("SELECT id, name, email, role, status FROM users");
        res.status(200).json(result.rows);
    } catch (error) {
        console.error("Error fetching users:", error);
        res.status(500).json({ error: "Server error" });
    }
});

app.get('/api/admin/cards/pending', authenticate, async(req, res) => {
    try {
        const result = await db.query('SELECT * FROM card_requests WHERE status = $1', ['pending']);
        res.status(200).json(result.rows);
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});


app.put("/api/admin/cards/:cardId", authenticate, async(req, res) => {
    try {
        const { cardId } = req.params;
        const { status } = req.body; 

        if (!req.user.isAdmin) {
            return res.status(403).json({ error: "Access denied. Admins only." });
        }
 
        const result = await db.query(
            "UPDATE bank_cards SET status = $1 WHERE id = $2 RETURNING *", [status, cardId]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ error: "Card not found" });
        }

        res.status(200).json({ message: `Card ${cardId} updated successfully`, card: result.rows[0] });
    } catch (error) {
        console.error("Error updating card:", error);
        res.status(500).json({ error: "Server error" });
    }
});

app.get('/api/user/profile', authenticate, async(req, res) => {
    try {
        const result = await db.query('SELECT id, email, first_name, last_name, phone, address FROM users WHERE id = $1', [req.user.id]);
        if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
        res.status(200).json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

app.put('/api/user/profile', authenticate, async(req, res) => {
    try {
        const { phone, address } = req.body;
        await db.query('UPDATE users SET phone = COALESCE($1, phone), address = COALESCE($2, address) WHERE id = $3', [phone, address, req.user.id]);
        res.status(200).json({ message: 'Profile updated' });
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

app.get('/api/user/notifications', authenticate, async(req, res) => {
    try {
        const result = await db.query('SELECT id, title, message, type, created_at, is_read FROM notifications WHERE userid = $1 ORDER BY created_at DESC LIMIT 20', [req.user.id]);
        res.status(200).json({ notifications: result.rows });
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});


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

const validateTransfer = (req, res, next) => {
    const { fromAccount, toAccount, amount } = req.body;

    if (!fromAccount || !toAccount) {
        return res.status(400).json({ error: 'Account IDs are required' });
    }

    if (!amount || isNaN(amount) || amount <= 0) {
        return res.status(400).json({ error: 'Valid amount is required' });
    }

    if (fromAccount === toAccount) {
        return res.status(400).json({ error: 'Cannot transfer to the same account' });
    }

    next();
};

app.post('/api/accounts/transfer', authenticate, validateTransfer, async(req, res) => {
    const { fromAccount, toAccount, amount } = req.body;
    try {
        await db.query('BEGIN');

        const sender = await db.query(
            'SELECT balance FROM accounts WHERE id = $1 AND userid = $2 FOR UPDATE', [fromAccount, req.user.id]
        );

        if (sender.rows.length === 0) {
            await db.query('ROLLBACK');
            return res.status(404).json({ error: 'Sender account not found or unauthorized' });
        }

        if (parseFloat(sender.rows[0].balance) < parseFloat(amount)) {
            await db.query('ROLLBACK');
            return res.status(400).json({ error: 'Insufficient balance' });
        }

        await db.query('UPDATE accounts SET balance = balance - $1 WHERE id = $2', [amount, fromAccount]);

        const recipient = await db.query(
            'UPDATE accounts SET balance = balance + $1 WHERE id = $2 RETURNING id', [amount, toAccount]
        );

        if (recipient.rows.length === 0) {
            await db.query('ROLLBACK');
            return res.status(404).json({ error: 'Recipient account not found' });
        }

        await db.query(
            'INSERT INTO transactions (sender_account_id, receiver_account_id, amount, transaction_type, status) VALUES ($1, $2, $3, $4, $5) RETURNING id', [fromAccount, toAccount, amount, 'transfer', 'completed']
        );

        await db.query('COMMIT');
        res.status(200).json({ message: 'Transfer successful' });
    } catch (error) {
        await db.query('ROLLBACK');
        console.error('Transfer error:', error);
        res.status(500).json({ error: 'Transfer failed due to server error' });
    }
});


const port = 3000;
app.listen(port, () => {
    console.log(`server runs on ${port}`);
})
