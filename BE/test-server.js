const express = require('express');
const cors = require('cors');  // ← This was missing
const app = express();
const PORT = 5000;

// Middleware
app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.json({ message: 'Server is working!' });
});

app.post('/test', (req, res) => {
  res.json({ received: req.body });
});

app.listen(PORT, () => {
  console.log(`✅ Test server running on http://localhost:${PORT}`);
});