const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const adminSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
});

adminSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

adminSchema.methods.comparePassword = async function (candidate) {
  return await bcrypt.compare(candidate, this.password);
};

module.exports = mongoose.model("Admin", adminSchema);
