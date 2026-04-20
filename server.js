const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const mongoSanitize = require("express-mongo-sanitize");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 5000;

/* -----------------------------
 * Middleware พื้นฐาน
 * ----------------------------- */
app.use(cors());
app.use(express.json({ limit: "10mb" })); // สำหรับ payload JSON ทั่วไป (multer ดูแล multipart)
app.use(mongoSanitize()); // mongoSanitize (ป้องกัน NoSQL Injection)

/* -----------------------------
 * Routes
 * ----------------------------- */
const courseRoutes = require("./routes/courseRoutes");
const orderRoutes = require("./routes/orderRoutes");
const authRoutes = require("./routes/authRoutes");
const adminRoutes = require("./routes/adminRoutes");
const uploadRoutes = require("./routes/uploadRoutes");
const quizRoutes = require("./routes/quizRoutes");
const certificateRoutes = require("./routes/certificateRoutes");
const notificationRoutes = require("./routes/notificationRoutes");
const Order = require("./models/Order");

app.use("/api/courses", courseRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/upload", uploadRoutes);
app.use("/api/quiz", quizRoutes);
app.use("/api/certificates", certificateRoutes);
app.use("/api/notifications", notificationRoutes);

// health check
app.get("/health", (req, res) => res.json({ ok: true }));

/* -----------------------------
 * Global Error Handler (ออปชัน)
 * ถ้า route ไหนโยน error ออกมา จะลงที่นี่
 * ----------------------------- */
app.use((err, req, res, next) => {
  console.error(err);
  // ถ้ามาจาก Multer จะมี code พิเศษ
  if (err.code === "LIMIT_FILE_SIZE") {
    return res.status(400).json({ message: "ไฟล์ใหญ่เกินกำหนด" });
  }
  res
    .status(err.status || 500)
    .json({ message: err.message || "Server error" });
});

/* -----------------------------
 * เชื่อม MongoDB แล้วค่อย start server
 * ----------------------------- */
mongoose
  .connect(process.env.MONGO_URI, { family: 4 })
  .then(async () => {
    console.log("MongoDB connected");

    const normalizeResult = await Order.updateMany(
      { paymentStatus: "refunded" },
      { $set: { paymentStatus: "failed" } },
    );
    if (normalizeResult.modifiedCount > 0) {
      console.log(
        `Normalized ${normalizeResult.modifiedCount} legacy refunded orders to failed`,
      );
    }

    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  })
  .catch((err) => {
    console.error("MongoDB connection error:", err);
    process.exit(1);
  });
