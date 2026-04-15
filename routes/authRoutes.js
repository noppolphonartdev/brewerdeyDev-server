const express = require("express");
const router = express.Router();
const verifyToken = require("../middleware/verifyToken");
const isAdmin = require("../middleware/isAdmin");
const authController = require("../controllers/authController");

// --- Multer Setup for Avatar Upload ---
const multer = require("multer");
const avatarImageFilter = (req, file, cb) => {
  if (/^image\//i.test(file.mimetype)) return cb(null, true);
  cb(new Error("รองรับเฉพาะไฟล์ภาพสำหรับรูปโปรไฟล์"), false);
};

const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: avatarImageFilter,
  limits: { fileSize: 5 * 1024 * 1024 },
});
// -------------------------------------

// --- Authentication Routes ---

// POST /api/auth/register
router.post("/register", authController.register);

// POST /api/auth/login
router.post("/login", authController.login);

// GET /api/auth/verify/:token
router.get("/verify/:token", authController.verifyEmail);

// POST /api/auth/forgot-password
router.post("/forgot-password", authController.forgotPassword);

// POST /api/auth/reset-password
router.post("/reset-password", authController.resetPassword);

// POST /api/auth/resend-verification
router.post("/resend-verification", authController.resendVerification);

// POST /api/auth/admin/resend-verification/:id
router.post(
  "/admin/resend-verification/:id",
  verifyToken,
  isAdmin,
  authController.adminResendVerification,
);

// -------------------------------------
// --- User Profile Routes (Protected) ---

// PUT /api/auth/profile (Update name, lastname)
router.put("/profile", verifyToken, authController.updateProfile);

// POST /api/auth/avatar (Upload profile picture)
router.post(
  "/avatar",
  verifyToken,
  upload.single("avatar"),
  authController.uploadAvatar,
);

// PUT /api/auth/change-password
router.put("/change-password", verifyToken, authController.changePassword);

// ตัวดัก Error เฉพาะ route อัปโหลด avatar
router.use((err, req, res, next) => {
  if (!req.originalUrl.includes("/avatar")) return next(err);

  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res
        .status(400)
        .json({ message: "ไฟล์รูปโปรไฟล์ใหญ่เกินกำหนด (สูงสุด 5MB)" });
    }
    return res.status(400).json({ message: `อัปโหลดล้มเหลว: ${err.message}` });
  }

  if (err) {
    return res
      .status(400)
      .json({ message: err.message || "อัปโหลดรูปโปรไฟล์ไม่สำเร็จ" });
  }

  return next();
});

module.exports = router;
