const jwt = require('jsonwebtoken');
const axios = require('axios');
const SECRET = 'your_super_secret_key';
const token = jwt.sign({ id: 2, email: 'mehedy303@gmail.com', role: 'admin' }, SECRET, { expiresIn: '24h' });

axios.get('http://localhost:7286/admin/users', {
  headers: { Authorization: `Bearer ${token}` }
}).then(res => console.log(res.data)).catch(err => console.error(err.response?.data || err.message));
