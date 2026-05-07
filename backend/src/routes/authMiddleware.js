const jwt = require('jsonwebtoken');
const db = require('../db');
const SECRET = process.env.JWT_SECRET || 'your_super_secret_key';

module.exports = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    let token = authHeader && authHeader.split(' ')[1];
    
    // Support cookie-based auth
    if (!token && req.cookies && req.cookies.token) {
      token = req.cookies.token;
    }

    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    try {
      const decoded = jwt.verify(token, SECRET);
      const user = await db.get("SELECT id, role, status FROM users WHERE id = ?", [decoded.id]);
      
      if (!user) {
        console.warn(`[Auth] Ghost user ${decoded.id} - DB reset?`);
        return res.status(401).json({ 
          error: 'Session invalid due to DB reset. Please sign up again.',
          code: 'USER_NOT_FOUND',
          redirect: '/auth/signup'
        });
      }

      if (user.status === 'suspended') {
        return res.status(403).json({ error: 'Your account has been suspended. Please contact support.' });
      }
      
      req.userId = user.id;
      req.userRole = user.role;
      next();
    } catch (err) {
      return res.status(401).json({ error: 'Invalid session. Please login.' });
    }
  } catch (e) {
    res.status(500).json({ error: 'Auth failed' });
  }
};
