const mongoose = require("mongoose");
const { Schema } = mongoose;

const certificateSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    courseId: {
      type: Schema.Types.ObjectId,
      ref: "Course",
      required: true,
      index: true,
    },
    orderId: {
      type: Schema.Types.ObjectId,
      ref: "Order",
    },

    // รหัส certificate (ไว้โชว์สวย ๆ + กันปลอม)
    certificateCode: {
      type: String,
      unique: true,
    },

    // คะแนน snapshot ตอนออกใบ
    preTestScore: { type: Number, default: 0 },
    preTestTotal: { type: Number, default: 0 },
    postTestScore: { type: Number, default: 0 },
    postTestTotal: { type: Number, default: 0 },

    // เงื่อนไขผ่าน ณ ขณะนั้น (เก็บเผื่อเปลี่ยนเกณฑ์ในอนาคต)
    passingScorePercent: { type: Number, default: 70 },

    issuedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// 1 คน / 1 คอร์ส มีใบ Certificate เดียว
certificateSchema.index({ userId: 1, courseId: 1 }, { unique: true });

module.exports =
  mongoose.models.Certificate ||
  mongoose.model("Certificate", certificateSchema, "certificates");
