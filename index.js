// Simple E-Commerce API using Node.js, Express, MongoDB (Mongoose)

const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const app = express();
const PORT=3000;

app.use(cors());

app.use(express.json());

// Connect to MongoDB
mongoose.connect('mongodb://localhost/ecommerce', {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log('✅ Connected to MongoDB'))
.catch(err => console.error('❌ MongoDB connection error:', err));


// User Schema
const userSchema = new mongoose.Schema({
  username: String,
  password: String,
  role: { type: String, enum: ['customer', 'admin'], default: 'customer' }
});
const User = mongoose.model('User', userSchema);

// Product Schema
const productSchema = new mongoose.Schema({
  name: String,
  category: String,
  price: Number,
  stock: Number
});
const Product = mongoose.model('Product', productSchema);

// Cart Schema
const cartSchema = new mongoose.Schema({
  userId: mongoose.Schema.Types.ObjectId,
  items: [{ productId: mongoose.Schema.Types.ObjectId, quantity: Number }]
});
const Cart = mongoose.model('Cart', cartSchema);

// Order Schema
const orderSchema = new mongoose.Schema({
  userId: mongoose.Schema.Types.ObjectId,
  items: [{ productId: mongoose.Schema.Types.ObjectId, quantity: Number }],
  total: Number,
  createdAt: { type: Date, default: Date.now }
});
const Order = mongoose.model('Order', orderSchema);

// Middleware to check JWT
const authenticate = (req, res, next) => {
  const token = req.header('Authorization');
  if (!token) return res.status(401).send('Access Denied');

  try {
    const verified = jwt.verify(token, 'secretkey');
    req.user = verified;
    next();
  } catch (err) {
    res.status(400).send('Invalid Token');
  }
};

const isAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') return res.status(403).send('Forbidden');
  next();
};

// Register
app.post('/register', async (req, res) => {
  const hashedPassword = await bcrypt.hash(req.body.password, 10);
  const user = new User({ username: req.body.username, password: hashedPassword });
  await user.save();
  res.send('User registered');
});
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});

// Login
app.post('/login', async (req, res) => {
  const user = await User.findOne({ username: req.body.username });
  if (!user || !(await bcrypt.compare(req.body.password, user.password))) return res.status(401).send('Invalid credentials');
  const token = jwt.sign({ _id: user._id, role: user.role }, 'secretkey');
  res.send({ token });
});

// Product Routes
app.get('/products', async (req, res) => {
  const { page = 1, limit = 10, search = '', category = '' } = req.query;
  const query = {
    name: { $regex: search, $options: 'i' },
    ...(category && { category })
  };
  const products = await Product.find(query)
    .skip((page - 1) * limit)
    .limit(parseInt(limit));
  res.send(products);
});

app.post('/products', authenticate, isAdmin, async (req, res) => {
  const product = new Product(req.body);
  await product.save();
  res.send('Product added');
});

app.put('/products/:id', authenticate, isAdmin, async (req, res) => {
  await Product.findByIdAndUpdate(req.params.id, req.body);
  res.send('Product updated');
});

app.delete('/products/:id', authenticate, isAdmin, async (req, res) => {
  await Product.findByIdAndDelete(req.params.id);
  res.send('Product deleted');
});

// Cart Routes
app.get('/cart', authenticate, async (req, res) => {
  const cart = await Cart.findOne({ userId: req.user._id });
  res.send(cart);
});

app.post('/cart', authenticate, async (req, res) => {
  let cart = await Cart.findOne({ userId: req.user._id });
  if (!cart) cart = new Cart({ userId: req.user._id, items: [] });

  const existing = cart.items.find(i => i.productId.equals(req.body.productId));
  if (existing) {
    existing.quantity += req.body.quantity;
  } else {
    cart.items.push(req.body);
  }

  await cart.save();
  res.send('Item added to cart');
});

app.put('/cart/:itemId', authenticate, async (req, res) => {
  const cart = await Cart.findOne({ userId: req.user._id });
  const item = cart.items.id(req.params.itemId);
  item.quantity = req.body.quantity;
  await cart.save();
  res.send('Cart updated');
});

app.delete('/cart/:itemId', authenticate, async (req, res) => {
  const cart = await Cart.findOne({ userId: req.user._id });
  cart.items.id(req.params.itemId).remove();
  await cart.save();
  res.send('Item removed');
});

// Order Routes
app.post('/orders', authenticate, async (req, res) => {
  const cart = await Cart.findOne({ userId: req.user._id }).populate('items.productId');
  if (!cart) return res.status(400).send('Cart is empty');

  const total = cart.items.reduce((sum, i) => sum + i.productId.price * i.quantity, 0);

  const order = new Order({ userId: req.user._id, items: cart.items, total });
  await order.save();

  cart.items = [];
  await cart.save();

  res.send('Order placed');
});

// Start Server
app.listen(3000, () => console.log('Server running on http://localhost:3000'))
