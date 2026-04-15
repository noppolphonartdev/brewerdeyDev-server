const mongoose = require("mongoose");

// ---------- Schema สำหรับ Lesson / Section (Curriculum เดิม) ----------
const LessonSchema = new mongoose.Schema({
  title: { type: String, required: true }, // ชื่อบทเรียน
  duration: { type: Number, default: 0 }, // ระยะเวลา (นาที)
  videoUrl: { type: String, default: "" }, // ลิงก์วิดีโอ หรือ path ที่อัปโหลด
  freePreview: { type: Boolean, default: false }, // true = เปิดให้ดูฟรี
});

const SectionSchema = new mongoose.Schema({
  title: { type: String, required: true }, // ชื่อหัวข้อใหญ่
  lessons: { type: [LessonSchema], default: [] },
});

// ---------- หลัก ๆ ของ Course + Curriculum รวมกัน ----------
const courseSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    description: String,
    startDate: Date,
    duration: Number,
    price: Number,
    instructor: String,
    image: String,
    whatYouWillLearn: String,
    targetAudience: String,
    requirements: String,

    // ======= Curriculum  =======
    curriculum: { type: [SectionSchema], default: [] },
  },
  { timestamps: true }
);

module.exports =
  mongoose.models.Course || mongoose.model("Course", courseSchema, "courses");
