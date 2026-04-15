const jwt = require('jsonwebtoken');

const verifyToken = (req, res, next) => {
  const authHeader = req.headers.authorization;

  // ตรวจสอบว่า header มี Bearer token ไหม
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'ไม่พบ token' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET); // ตรวจสอบ token
    req.user = decoded; // แนบข้อมูลผู้ใช้ใน req.user
    next(); // ดำเนินต่อ
  } catch (err) {
    return res.status(403).json({ message: 'Token ไม่ถูกต้อง หรือหมดอายุ' });
  }
};

module.exports = verifyToken;
