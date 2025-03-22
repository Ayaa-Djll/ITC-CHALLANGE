import express from "express";
import cors from 'cors';
import dotenv from 'dotenv';
import pg from 'pg';

const app = express();
dotenv.config();
app.use(express.json());
app.use(cors());


const db = new pg.Client({
    user: process.env.PG_USER,
    host: process.env.PG_HOST,
    database: process.env.PG_DATABASE,
    password: process.env.PG_PASSWORD,
    port: process.env.PG_PORT,
});
db.connect();

app.post("/api/auth/login", (req, res) => {
    res.send("User logged in");
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


app.get("/api/transactions/:userId", (req, res) => {
    res.send(`Transaction history for user ${req.params.userId}`);
});

app.post("/api/transactions", (req, res) => {
    res.send("Transaction processed");
});


app.post("/api/cards/request", (req, res) => {
    res.send("Bank card request submitted");
});

app.get("/api/cards/:userId", (req, res) => {
    res.send(`Bank cards for user ${req.params.userId}`);
});


app.get("/api/admin/users", (req, res) => {
    res.send("Admin: List of all users");
});

app.put("/api/admin/cards/:cardId", (req, res) => {
    res.send(`Card request ${req.params.cardId} updated`);
});


const port = 3000;
app.listen(port, () => {
    console.log(`server runs on ${port}`);
})