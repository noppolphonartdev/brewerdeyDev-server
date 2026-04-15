const mongoose = require("mongoose");

// โมเดลสำหรับเก็บ "แจ้งเตือน" ของผู้ใช้
const notificationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    adminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      default: null,
    },
    recipientType: {
      type: String,
      enum: ["user", "admin"],
      default: "user",
    },

    // หัวข้อ/ข้อความที่จะแสดงใน UI
    title: { type: String, required: true },
    message: { type: String, default: "" },

    // ลิงก์สำหรับกดไปหน้า เช่น /my-orders หรือ /course/:id
    link: { type: String, default: "/my-orders" },

    // สถานะอ่านแล้วหรือยัง
    isRead: { type: Boolean, default: false },

    // ประเภท (เอาไว้ filter ภายหลัง)
    type: { type: String, default: "order" },
  },
  { timestamps: true },
);

notificationSchema.pre("validate", function () {
  if (this.recipientType === "admin" && !this.adminId) {
    this.invalidate(
      "adminId",
      "adminId is required when recipientType is admin",
    );
  }
  if (this.recipientType === "user" && !this.userId) {
    this.invalidate("userId", "userId is required when recipientType is user");
  }
});

module.exports = mongoose.model("Notification", notificationSchema);
