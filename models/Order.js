const mongoose = require("mongoose");

// Schema สำหรับเก็บข้อมูล "คำสั่งซื้อ" (Order)
const orderSchema = new mongoose.Schema({
  // --- ข้อมูลหลักของคำสั่งซื้อ ---
  courseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Course",
    required: true,
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },

  // --- ข้อมูลการชำระเงิน ---
  totalPrice: {
    type: Number,
    required: true,
  },
  paymentStatus: {
    type: String,
    enum: ["pending", "paid", "failed"], // สถานะการชำระเงิน
    default: "pending",
  },
  paymentIntentId: {
    // รหัสอ้างอิงจาก Payment Gateway เช่น Omise, Stripe
    type: String,
  },

  // --- สลิป/การตรวจสอบของแอดมิน ---
  slipUrl: { type: String, default: "" }, // path รูปสลิป เช่น /uploads/xxx.jpg
  slipUploadedAt: { type: Date, default: null },
  slipNote: { type: String, default: "" }, // note จากผู้ใช้ (ไม่บังคับ)

  reviewedBy: {
    // เก็บ id ของผู้ที่อนุมัติ/ปฏิเสธ (อาจเป็น User ที่ role admin)
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    default: null,
  },
  reviewedAt: { type: Date, default: null },
  paidAt: { type: Date, default: null }, // เซ็ตเมื่ออนุมัติเป็น paid

  // --- ข้อมูลลูกค้า (เก็บไว้เพื่อความสะดวก) ---
  customerName: { type: String, required: true },
  customerEmail: { type: String, required: true },
  customerPhone: { type: String },

  // --- วัน-เวลา ---
  purchaseDate: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model("Order", orderSchema);
