const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const User = require("../models/User");
const { sendMail } = require("../utils/mailer");
const { cloudinary, ensureCloudinaryConfig } = require("../utils/cloudinary");

// --- Utility Functions (ฟังก์ชันช่วย) ---

const generateToken = (user) => {
  return jwt.sign(
    {
      id: user._id,
      name: user.name,
      lastname: user.lastname,
      email: user.email,
      role: user.role,
      verified: user.verified,
    },
    process.env.JWT_SECRET,
    { expiresIn: "7d" },
  );
};

const sendVerificationEmail = async (user, token) => {
  const url = `${process.env.APP_URL}/verify/${token}`;
  return sendMail({
    to: user.email,
    subject: "กรุณายืนยันอีเมลของคุณ",
    text: `คลิกเพื่อยืนยัน: ${url}`,
    html: `<p>คลิกเพื่อยืนยัน: <a href="${url}">${url}</a></p>`,
  });
};

const uploadBufferToCloudinary = (buffer, options) =>
  new Promise((resolve, reject) => {
    ensureCloudinaryConfig();
    const stream = cloudinary.uploader.upload_stream(options, (err, result) => {
      if (err) return reject(err);
      resolve(result);
    });
    stream.end(buffer);
  });

const sendPasswordResetEmail = async (user, resetToken) => {
  const url = `${process.env.APP_URL}/reset-password/${resetToken}`;
  return sendMail({
    to: user.email,
    subject: "รีเซ็ตรหัสผ่านบัญชีของคุณ",
    text: `เราได้รับคำขอรีเซ็ตรหัสผ่านสำหรับบัญชีนี้\n\nคลิกเพื่อรีเซ็ตรหัสผ่าน: ${url}\nลิงก์นี้มีอายุ 1 ชั่วโมง และใช้งานได้เพียงครั้งเดียว`,
    html: `
      <p>เราได้รับคำขอรีเซ็ตรหัสผ่านสำหรับบัญชีนี้</p>
      <p>คลิกเพื่อรีเซ็ตรหัสผ่าน: <a href="${url}">${url}</a></p>
      <p>ลิงก์นี้มีอายุ 1 ชั่วโมง และใช้งานได้เพียงครั้งเดียว</p>
      <p>หากคุณไม่ได้เป็นผู้ร้องขอ สามารถละเว้นอีเมลฉบับนี้ได้</p>
    `,
  });
};

// --- Controller Functions (Logic หลัก) ---
exports.register = async (req, res) => {
  console.log("=== REGISTER START ===");
  const { name, lastname, email, password } = req.body;
  console.log("Request body:", { name, lastname, email, password: "***" });

  try {
    console.log("Step 1: Checking existing user...");
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      console.log("User already exists");
      return res.status(400).json({ message: "อีเมลนี้ถูกใช้ไปแล้ว" });
    }

    console.log("Step 2: Creating new user...");
    const user = new User({ name, lastname, email, password });
    console.log("Step 3: Saving user...");
    await user.save();
    console.log("Step 4: Creating JWT token...");
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
      expiresIn: "1d",
    });

    console.log("Step 5: Sending verification email in background...");
    sendVerificationEmail(user, token)
      .then((sent) => {
        if (sent === false) {
          console.warn(
            "ระบบยังไม่พร้อมส่งเมลยืนยันสมัครสมาชิก (missing mail config)",
          );
        }
      })
      .catch((mailErr) => {
        console.error("ส่งเมลยืนยันสมัครสมาชิกไม่สำเร็จ:", mailErr.message);
      });

    console.log("Step 6: Sending response...");
    return res.status(201).json({
      message:
        "สมัครเสร็จแล้ว ระบบกำลังส่งอีเมลยืนยัน กรุณาตรวจสอบกล่องจดหมายหรือกดส่งอีกครั้งที่หน้ารอยืนยัน",
    });
  } catch (err) {
    console.error("REGISTER ERROR:", err);
    console.error("ERROR STACK:", err.stack);
    res.status(500).json({ message: "เกิดข้อผิดพลาด", error: err.message });
  }
};

exports.adminResendVerification = async (req, res) => {
  const { id } = req.params;

  try {
    const user = await User.findById(id);

    if (!user) {
      return res.status(404).json({ message: "ไม่พบบัญชีผู้ใช้" });
    }

    if (user.verified) {
      return res.status(400).json({ message: "อีเมลนี้ได้รับการยืนยันแล้ว" });
    }

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
      expiresIn: "1d",
    });

    const sent = await sendVerificationEmail(user, token);
    if (sent === false) {
      return res.status(500).json({
        message:
          "ระบบส่งอีเมลยังไม่พร้อมใช้งาน กรุณาตรวจสอบการตั้งค่าเมลเซิร์ฟเวอร์",
      });
    }

    return res.json({ message: "ส่งอีเมลยืนยันให้สมาชิกเรียบร้อยแล้ว" });
  } catch (err) {
    return res
      .status(500)
      .json({ message: "เกิดข้อผิดพลาด", error: err.message });
  }
};

exports.forgotPassword = async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ message: "กรุณากรอกอีเมล" });
  }

  try {
    const user = await User.findOne({ email });

    if (!user) {
      return res.json({
        message: "หากอีเมลนี้อยู่ในระบบ เราจะส่งลิงก์รีเซ็ตรหัสผ่านให้",
      });
    }

    const resetToken = crypto.randomBytes(32).toString("hex");
    const hashedToken = crypto
      .createHash("sha256")
      .update(resetToken)
      .digest("hex");

    user.resetPasswordToken = hashedToken;
    user.resetPasswordExpires = new Date(Date.now() + 60 * 60 * 1000);
    await user.save();

    await sendPasswordResetEmail(user, resetToken);

    return res.json({
      message: "หากอีเมลนี้อยู่ในระบบ เราจะส่งลิงก์รีเซ็ตรหัสผ่านให้",
    });
  } catch (err) {
    return res
      .status(500)
      .json({ message: "เกิดข้อผิดพลาด", error: err.message });
  }
};

exports.resetPassword = async (req, res) => {
  const { token, password } = req.body;

  if (!token || !password) {
    return res.status(400).json({ message: "ข้อมูลไม่ครบถ้วน" });
  }

  if (password.length < 6) {
    return res
      .status(400)
      .json({ message: "รหัสผ่านใหม่ต้องมีอย่างน้อย 6 ตัวอักษร" });
  }

  try {
    const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

    const user = await User.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpires: { $gt: new Date() },
    });

    if (!user) {
      return res
        .status(400)
        .json({ message: "ลิงก์รีเซ็ตรหัสผ่านไม่ถูกต้องหรือหมดอายุ" });
    }

    user.password = password;
    user.resetPasswordToken = null;
    user.resetPasswordExpires = null;
    await user.save();

    return res.json({
      message: "รีเซ็ตรหัสผ่านสำเร็จ กรุณาเข้าสู่ระบบอีกครั้ง",
    });
  } catch (err) {
    return res
      .status(500)
      .json({ message: "เกิดข้อผิดพลาด", error: err.message });
  }
};

exports.login = async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: "อีเมลหรือรหัสผ่านไม่ถูกต้อง" });
    }
    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      return res.status(400).json({ message: "อีเมลหรือรหัสผ่านไม่ถูกต้อง" });
    }
    res.json({
      _id: user._id,
      name: user.name,
      lastname: user.lastname,
      email: user.email,
      role: user.role,
      avatar: user.avatar,
      verified: user.verified,
      token: generateToken(user),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.verifyEmail = async (req, res) => {
  try {
    const decoded = jwt.verify(req.params.token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);
    if (!user) return res.status(404).send("ไม่พบผู้ใช้");
    if (user.verified) return res.send("คุณได้ยืนยันแล้ว");
    user.verified = true;
    await user.save();
    res.send("ยืนยันอีเมลสำเร็จแล้ว! คุณสามารถเข้าสู่ระบบได้");
  } catch (err) {
    res.status(400).send("ลิงก์ยืนยันไม่ถูกต้องหรือหมดอายุ");
  }
};

exports.updateProfile = async (req, res) => {
  try {
    const { name, lastname } = req.body;
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "ไม่พบผู้ใช้" });
    user.name = name || user.name;
    user.lastname = lastname || user.lastname;
    await user.save();
    res.json({
      _id: user._id,
      name: user.name,
      lastname: user.lastname,
      email: user.email,
      role: user.role,
      avatar: user.avatar,
      verified: user.verified,
      token: req.headers.authorization.split(" ")[1],
    });
  } catch (err) {
    res.status(500).json({ message: "เกิดข้อผิดพลาด", error: err.message });
  }
};

exports.uploadAvatar = async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: "กรุณาเลือกไฟล์ภาพ" });
  }
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "ไม่พบผู้ใช้" });
    const uploaded = await uploadBufferToCloudinary(req.file.buffer, {
      folder: "online-course-management/avatars",
      resource_type: "image",
    });
    user.avatar = uploaded.secure_url;
    await user.save();
    res.json({
      _id: user._id,
      name: user.name,
      lastname: user.lastname,
      email: user.email,
      role: user.role,
      avatar: user.avatar,
      verified: user.verified,
      token: req.headers.authorization.split(" ")[1],
    });
  } catch (err) {
    const status =
      err?.http_code && Number.isInteger(err.http_code) ? err.http_code : 500;
    res
      .status(status)
      .json({ message: err.message || "เกิดข้อผิดพลาด", error: err.message });
  }
};

exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "ไม่พบผู้ใช้" });
    const isMatch = await user.matchPassword(currentPassword);
    if (!isMatch)
      return res.status(400).json({ message: "รหัสผ่านปัจจุบันไม่ถูกต้อง" });
    if (newPassword.length < 6)
      return res
        .status(400)
        .json({ message: "รหัสผ่านใหม่ต้องมีอย่างน้อย 6 ตัวอักษร" });
    user.password = newPassword;
    await user.save();
    res.json({ message: "เปลี่ยนรหัสผ่านสำเร็จ" });
  } catch (err) {
    res.status(500).json({ message: "เกิดข้อผิดพลาด", error: err.message });
  }
};

exports.resendVerification = async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ message: "กรุณากรอกอีเมล" });
  }

  try {
    const user = await User.findOne({ email });

    if (!user) {
      return res
        .status(404)
        .json({ message: "ไม่พบบัญชีผู้ใช้สำหรับอีเมลนี้" });
    }

    if (user.verified) {
      return res.status(400).json({ message: "อีเมลนี้ได้รับการยืนยันแล้ว" });
    }

    const now = new Date();
    const cooldownMs = 30 * 60 * 1000;
    const maxResendInWindow = 2;

    if (user.resendCooldown && user.resendCooldown > now) {
      if ((user.resendCount || 0) >= maxResendInWindow) {
        const minutesLeft = Math.ceil(
          (user.resendCooldown.getTime() - now.getTime()) / 60000,
        );
        return res.status(429).json({
          message: `ส่งอีเมลได้สูงสุด ${maxResendInWindow} ครั้งใน 30 นาที กรุณาลองใหม่อีกครั้งใน ${minutesLeft} นาที`,
        });
      }
    } else {
      user.resendCount = 0;
      user.resendCooldown = new Date(now.getTime() + cooldownMs);
    }

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
      expiresIn: "1d",
    });
    await sendVerificationEmail(user, token);

    user.resendCount = (user.resendCount || 0) + 1;
    if (!user.resendCooldown || user.resendCooldown <= now) {
      user.resendCooldown = new Date(now.getTime() + cooldownMs);
    }
    await user.save();

    return res.json({ message: "ส่งอีเมลยืนยันอีกครั้งเรียบร้อยแล้ว" });
  } catch (err) {
    return res
      .status(500)
      .json({ message: "เกิดข้อผิดพลาด", error: err.message });
  }
};
