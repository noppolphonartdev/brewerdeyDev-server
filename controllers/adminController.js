const jwt = require('jsonwebtoken');
const Admin = require('../models/AdminModel');

exports.login = async (req, res) => {
    const { email, password } = req.body;

    try {
        const admin = await Admin.findOne({ email });

        // ตรวจสอบว่ามี admin และรหัสผ่านถูกต้องหรือไม่
        if (!admin || !(await admin.comparePassword(password))) {
            return res.status(401).json({ message: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' });
        }

        // สร้าง Token สำหรับ Admin
        const token = jwt.sign(
            { id: admin._id, role: 'admin' }, 
            process.env.JWT_SECRET, 
            { expiresIn: '1d' }
        );
        
        // ส่ง Token กลับไปให้ Frontend
        res.json({ token });

    } catch (err) {
        res.status(500).json({ message: "เกิดข้อผิดพลาดฝั่งเซิร์ฟเวอร์", error: err.message });
    }
};