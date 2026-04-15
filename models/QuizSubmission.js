const mongoose = require("mongoose");
const { Schema } = mongoose;

const AttemptSchema = new Schema(
  {
    score: { type: Number, required: true },
    total: { type: Number, required: true },
    answers: { type: [Schema.Types.Mixed], default: [] }, // index ช้อยส์ที่ตอบ
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const QuizSubmissionSchema = new Schema(
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
    type: { type: String, enum: ["pre", "post"], required: true }, // pre หรือ post
    attemptCount: { type: Number, default: 0 },
    bestScore: { type: Number, default: 0 },
    lastScore: { type: Number, default: 0 },
    total: { type: Number, default: 0 }, // จำนวนข้อ (อ้างอิงชุดล่าสุด)
    passed: { type: Boolean, default: false },
    attempts: { type: [AttemptSchema], default: [] },
  },
  { timestamps: true }
);

// ห้ามซ้ำ userId+courseId+type (1 คน / 1 คอร์ส / 1 ประเภท)
QuizSubmissionSchema.index(
  { userId: 1, courseId: 1, type: 1 },
  { unique: true }
);

module.exports =
  mongoose.models.QuizSubmission ||
  mongoose.model("QuizSubmission", QuizSubmissionSchema);
