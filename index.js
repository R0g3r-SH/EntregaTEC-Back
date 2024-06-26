import express from 'express';
import bodyParser from 'body-parser';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import axios from 'axios';
import { OpenAI } from 'openai';

const client = new OpenAI({ apiKey: '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' });
import dotenv from 'dotenv';
import { Response } from 'openai/_shims/registry.mjs';
//import { json } from 'body-parser';
dotenv.config();

//app use body parser
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

const sellSchema = new mongoose.Schema({
    article: String,
    price: Number,
    stock: Number,
    user_that_sell_id: String,
    active: Boolean,
    img_url: String,
    descripcion: String,
    ubicacion: String
});

const orderSchema = new mongoose.Schema({
    user_that_sell_id: String,
    user_that_bought_id: String,
    ubication: {
        ubication_to_deliver: String,
        ubicacion_to_pickup: String,
    },
    total: Number,
    products: [sellSchema], // Embedding sellSchema as a sub-document array,
    delivery_info: {
        user_that_deliver_id: String,
    },
    status: {
        type: String,
        enum: ['pending', 'completed', 'cancelled', 'on_the_way'], // Set the enum values
        default: 'pending' // Set a default value
    },
    secret_code: String
});

const User = mongoose.model('User', userSchema);
const Sell = mongoose.model('Sell', sellSchema);
const Order = mongoose.model('Order', orderSchema);

app.use(bodyParser.json());

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
    -
        bcrypt.compare(password, user.password, (err, result) => {
            if (err || !result) return res.status(401).json({ message: 'Invalid username or password' });

            res.json({ user: user._id });
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
    const { article, price, stock, user_that_sell_id, img_url, descripcion, ubicacion } = req.body;
    try {
        // Create a new delivery
        const newSell = new Sell({
            article,
            price,
            stock,
            user_that_sell_id,
            active: true,
            img_url,
            descripcion,
            ubicacion
        });
        // Save the delivery to the database
        await newSell.save();

        res.status(201).json({ message: 'Sell added successfully' });
    } catch (error) {
        console.error('Error adding sell:', error);
        res.status(500).json({ message: 'Internal server error' });
    }

});


// Get all sell entries by user id
app.get('/sell/:user_id', async (req, res) => {
    const { user_id } = req.params;
    try {
        const sells = await Sell.find({ user_that_sell_id: user_id });
        res.json(sells);
    } catch (error) {
        console.error('Error getting sells:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Get sell by id
app.get('/sell/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const sell = await Sell.findById(id);
        if (!sell) {
            return res.status(404).json({ message: 'Sell not found' });
        }
        res.json(sell);
    } catch (error) {
        console.error('Error getting sell:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

app.put('/sell_status/:id', async (req, res) => {
    //change the  fiield active value 
    const { id } = req.params;
    const { active } = req.body;

    try {
        const sell = await Sell.findById(id);

        if (!sell) {
            return res.status(404).json({ message: 'Sell not found' });
        }

        sell.active = active;
        await sell.save();

        res.json({ message: 'Sell updated successfully' });
    } catch (error) {
        console.error('Error updating sell:', error);
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

//edit a sell entry
app.put('/sell/:id', async (req, res) => {
    const { id } = req.params;
    const { article, price, stock, user_that_sell_id, active, img_url, descripcion, ubicacion } = req.body;
    try {
        const sell = await Sell.findById(id);
        if (!sell) {
            return res.status(404).json({ message: 'Sell not found' });
        }
        sell.article = article;
        sell.price = price;
        sell.stock = stock;
        sell.user_that_sell_id = user_that_sell_id;
        sell.active = active;
        sell.img_url = img_url;
        sell.descripcion = descripcion;
        sell.ubicacion = ubicacion;
        await sell.save();
        res.json({ message: 'Sell updated successfully' });
    } catch (error) {
        console.error('Error updating sell:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Get all sell entries
app.get('/sell', async (req, res) => {

    try {
        const sells = await Sell.find({ active: true });
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

//delete a sell entry
app.delete('/sell/:id', async (req, res) => {

    const { id } = req.params;

    try {
        const sell = await Sell.findById(id);
        if (!sell) {
            return res.status(404).json({ message: 'Sell not found' });
        }
        await sell.deleteOne();
        res.json({ message: 'Sell deleted successfully' });
    } catch (error) {
        console.error('Error deleting sell:', error);
        res.status(500).json({ message: 'Internal server error' });
    }

});

app.post('/create_order', async (req, res) => {

    const { total, products, user_that_sell_id, ubication_to_deliver, ubication_to_pickup, user_that_bought_id } = req.body;

    try {
        // Create a new order
        if (total == 0) {
            return res.status(404).json({ message: 'Total can not be 0' });
        }


        const secret_code = Math.random().toString(36).substring(7);

        //substract the products sttock field forn the sell schema

        //validate if the user exists

        



        try {
            const user = await User.findById(user_that_sell_id);
            if (!user) {
                return res.status(404).json({ message: 'User not found' });
            }

        } catch (error) {
            console.error('Error adding order:', error);
            res.status(500).json({ message: 'Internal server error' });
        }

        //validate if the products exists
        if (products.length == 0) {
            return res.status(404).json({ message: 'Products not found' });
        }



        const newOrder = new Order({
            user_that_sell_id,
            user_that_bought_id,
            ubication: {
                ubication_to_deliver,
                ubication_to_pickup
            },
            total,
            products,
            delivery_info: {
                user_that_deliver_id: null
            },
            secret_code: secret_code
        });
        // Save the order to the database
        await newOrder.save();

        
        products.map(async (product) => {
            const sell = await Sell.findById(product._id);
            if (!sell) {
                return res.status(404).json({ message: 'Sell not found' });
            }
            sell.stock -= product.stock;
            await sell.save();
        });

        res.status(201).json({ message: 'Order added successfully' });

    } catch (error) {

        console.error('Error adding order:', error);
        res.status(500).json({ message: 'Internal server error' });

    }
});

// trae todas las ordenes pendientes
app.get('/pending_orders', async (req, res) => {

    try {
        const orders = await Order.find({ status: 'pending' });
        res.json(orders);
    }
    catch (error) {
        console.error('Error getting orders:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
}
);

app.post('/take_order' , async (req, res) => {

    const { order_id, user_that_deliver_id } = req.body;

    try {
        const order = await Order.findById(order_id);
        if (!order) {
            return res.status(404).json({ message: 'Order not found' });
        }
        order.status = 'on_the_way';
        order.delivery_info.user_that_deliver_id = user_that_deliver_id;
        await order.save();
        res.json({ message: 'Order taken successfully' });

    } catch (error) {
        console.error('Error taking order:', error);
        res.status(500).json({ message: 'Internal server error' });
    }

});

app.get('/active_orders_by_client_id/:clientId' , async(req ,res) => {
    
    const user_that_bought_id = req.params.clientId;

    try {
        const orders = await Order.find({ user_that_bought_id: user_that_bought_id, status: { $ne: 'cancelled'  }});
        res.json(orders);
    } catch (error) {
        console.error('Error getting orders:', error);
        res.status(500).json({ message: 'Internal server error' });
    }

})

app.get('/active_orders_by_client_id/:deliverId' ,  async(req ,res) => {
    
    const user_that_deliver_id = req.params.deliverId;

    try {

        const orders = await Order.find({ 
            status: { $ne: 'canceled' },
            'delivery_info.user_that_deliver_id': user_that_deliver_id
        });

        res.json(orders);

    } catch (error) {

        console.error('Error getting orders:', error);
        res.status(500).json({ message: 'Internal server error' });
    
    }

})

app.post('/cancel_order', async (req, res) => {

    const { order_id } = req.body;

    try {
        const order = await Order.findById(order_id);
        if (!order) {
            return res.status(404).json({ message: 'Order not found' });
        }

        order.status = 'cancelled';
        await order.save();
        res.json({ message: 'Order cancelled successfully' });

    } catch (error) {
        console.error('Error cancelling order:', error);
        res.status(500).json({ message: 'Internal server error' });
    }

});

app.post('/complete_order', async (req, res) => {

    const { order_id , secret_code } = req.body;

    try {
        const order = await Order.findById(order_id);
        if (!order) {
            return res.status(404).json({ message: 'Order not found' });
        }

        if (order.secret_code != secret_code) {
            return res.status(404).json({ message: 'Invalid secret code' });
        }

        order.status = 'completed';
        await order.save();
        res.json({ message: 'Order completed successfully' });

    } catch (error) {
        console.error('Error completing order:', error);
        res.status(500).json({ message: 'Internal server error' });
    }

});
//por usuario otraer todas las ordenes de delivery



// Get all buy entries
app.listen(PORT, () => console.log(`Server is running on port ${PORT}`));
