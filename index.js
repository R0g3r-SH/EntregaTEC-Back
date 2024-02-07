const express = require('express');
const bodyParser = require('body-parser');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Connect to MongoDB Atlas
mongoose.connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(() => console.log('Connected to MongoDB Atlas'))
    .catch(err => console.error('Error connecting to MongoDB Atlas:', err));

// Define user schema and model
const userSchema = new mongoose.Schema({
    username: String,
    password: String
});

const User = mongoose.model('User', userSchema);

app.use(bodyParser.json());

// Authentication middleware
function authenticateToken(req, res, next) {
    const token = req.headers['authorization'];
    if (token == null) return res.sendStatus(401);

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) return res.sendStatus(403);
        req.user = user;
        next();
    });
}

// Login route
app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    const user = await User.findOne({ username });
    if (!user) return res.status(401).json({ message: 'Invalid username or password' });

    bcrypt.compare(password, user.password, (err, result) => {
        if (err || !result) return res.status(401).json({ message: 'Invalid username or password' });

        res.json({ user: " user logged in successfully" });
    });
});


// Add this route for user registration
app.post('/register', async (req, res) => {
    const { username, password } = req.body;
    try {
        // Check if the username already exists
        const existingUser = await User.findOne({ username });
        if (existingUser) {
            return res.status(400).json({ message: 'Username already exists' });
        }

        // Hash the password before saving it to the database
        const hashedPassword = await bcrypt.hash(password, 10);

        // Create a new user
        const newUser = new User({
            username,
            password: hashedPassword
        });

        // Save the user to the database
        await newUser.save();

        res.status(201).json({ message: 'User registered successfully' });
    } catch (error) {
        console.error('Error registering user:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});


// add sell arrticles to the database

app.post('/sell', async (req, res) => {
    const { article, price, quantity, user_that_sell_id } = req.body;   
    try {
        // Create a new delivery
        const newSell = new Sell({
            article,
            price,
            quantity,
            user_that_sell_id
        });

        // Save the delivery to the database
        await newSell.save();

        res.status(201).json({ message: 'Sell added successfully' });
    } catch (error) {
        console.error('Error adding sell:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});


// add buy arrticles to the database
app.post('/buy', async (req, res) => {
    const { article_id, quantity, user_that_bought_id } = req.body;
    try {
        // Create a new buy
        const newBuy = new Buy({
            article_id,
            quantity,
            user_that_bought_id
        });

        // Find the corresponding sell entry
        const sell = await Sell.findOne({ article_id });

        // Verify if the sell entry exists
        if (!sell) {
            return res.status(404).json({ message: 'Article not found for sale' });
        }
        // Verify if the quantity is available
        if (sell.quantity < quantity) {
            return res.status(400).json({ message: 'Requested quantity not available' });
        } else if (sell.quantity === quantity) {
            // If the requested quantity matches the available quantity, delete the sell entry
            await sell.deleteOne();
        } else {
            // Reduce the quantity available in the sell entry
            sell.quantity -= quantity;
            await sell.save();
        }

        // Save the buy entry
        await newBuy.save();

        res.status(201).json({ message: 'Buy added successfully' });
    } catch (error) {
        console.error('Error adding buy:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Get all sell entries
app.get('/sell', async (req, res) => {
    try {
        const sells = await Sell.find();
        res.json(sells);
    } catch (error) {
        console.error('Error getting sells:', error);
        res.status(500).json({ message: 'Internal server error' });
    }

});

// Get all buy entries by user id
app.get('/buy/:user_id', async (req, res) => {
    const { user_id } = req.params;
    try {
        const buys = await Buy.find({ user_that_bought_id: user_id });
        res.json(buys);
    } catch (error) {
        console.error('Error getting buys:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});







app.listen(PORT, () => console.log(`Server is running on port ${PORT}`));
