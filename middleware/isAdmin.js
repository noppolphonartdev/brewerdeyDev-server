//Middleware เช็กสิทธิ์ admin-only
module.exports = (req, res, next) => {
  // เช็กว่า role ใน token เป็น admin หรือไม่
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'ต้องเป็นแอดมินเท่านั้น' });
  }
  next();
};