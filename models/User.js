const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

//ใส่ field
const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  lastname: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  avatar: { type: String, default: null },
  verified: { type: Boolean, default: false },
  role: { type: String, enum: ["user", "admin"], default: "user" },
  resendCount: { type: Number, default: 0 },
  resendCooldown: { type: Date, default: null },
  resetPasswordToken: { type: String, default: null },
  resetPasswordExpires: { type: Date, default: null },
});

// เข้ารหัส password ก่อนบันทึก
userSchema.pre("save", async function () {
  if (!this.isModified("password") && !this.isNew) {
    return;
  }

  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// ตรวจสอบ password ตอน login
userSchema.methods.matchPassword = async function (entered) {
  return await bcrypt.compare(entered, this.password);
};

module.exports = mongoose.model("User", userSchema);
