const mongoose = require("mongoose");

// schema สำหรับข้อสอบของแต่ละข้อ
const QuestionSchema = new mongoose.Schema({
  prompt: { type: String, required: true }, // โจทย์คำถาม
  choices: {
    type: [String],
    required: true,
    validate: (v) => v.length === 4, // บังคับให้มี 4 ตัวเลือก
  },
  correctIndex: { type: Number, required: true, min: 0, max: 3 }, // index คำตอบที่ถูก
  explanation: { type: String, default: "" }, // เฉลย/คำอธิบาย
});

// 1:1 กับคอร์ส
const courseQuizSchema = new mongoose.Schema(
  {
    courseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Course",
      required: true,
      unique: true, // 1 คอร์สมีชุด pre/post ชุดเดียว
      index: true,
    },
    preTest: { type: [QuestionSchema], default: [] },
    postTest: { type: [QuestionSchema], default: [] },

    passingScorePercent: { type: Number, default: 70 },
    requirePreTest: { type: Boolean, default: true },
  },

  { timestamps: true }
);

module.exports =
  mongoose.models.CourseQuiz ||
  mongoose.model("CourseQuiz", courseQuizSchema, "coursequizzes");
