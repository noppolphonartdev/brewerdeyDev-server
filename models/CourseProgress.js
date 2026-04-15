const mongoose = require("mongoose");

const lessonProgressSchema = new mongoose.Schema(
  {
    pct: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    done: {
      type: Boolean,
      default: false,
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false },
);

const courseProgressSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    courseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Course",
      required: true,
    },
    lessons: {
      type: Map,
      of: lessonProgressSchema,
      default: {},
    },
  },
  { timestamps: true },
);

courseProgressSchema.index({ userId: 1, courseId: 1 }, { unique: true });

module.exports =
  mongoose.models.CourseProgress ||
  mongoose.model("CourseProgress", courseProgressSchema);
