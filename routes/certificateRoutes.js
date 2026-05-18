const express = require("express");
const router = express.Router();
const verifyToken = require("../middleware/verifyToken");
const Certificate = require("../models/Certificate");
const Course = require("../models/Course");
const Order = require("../models/Order");
const QuizSubmission = require("../models/QuizSubmission");
const CourseQuiz = require("../models/CourseQuiz");

async function isEligibleForCertificate(userId, courseId) {
  const paidOrder = await Order.findOne({
    userId,
    courseId,
    paymentStatus: "paid",
  });
  if (!paidOrder) return false;

  const pre = await QuizSubmission.findOne({ userId, courseId, type: "pre" });
  const post = await QuizSubmission.findOne({ userId, courseId, type: "post" });
  if (!pre || !post) return false;
  if (!post.passed) return false;

  const quizConfig = await CourseQuiz.findOne({ courseId });
  const passingPercent =
    typeof quizConfig?.passingScorePercent === "number"
      ? quizConfig.passingScorePercent
      : 70;

  const postPercent = post.total > 0 ? (post.bestScore / post.total) * 100 : 0;
  return postPercent >= passingPercent;
}

// GET /api/certificates/:courseId/me
// ใช้ฝั่งผู้เรียนถามว่าคอร์สนี้มี certificate หรือยัง
router.get("/:courseId/me", verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const courseId = req.params.courseId;

    const course = await Course.findById(courseId).select("certificateEnabled");
    if (!course || !course.certificateEnabled) {
      return res.status(404).json({ hasCertificate: false });
    }

    const cert = await Certificate.findOne({
      userId,
      courseId,
    })
      .populate("courseId", "title instructor")
      .populate("userId", "name lastname email");

    if (!cert) {
      return res.status(404).json({ hasCertificate: false });
    }

    const eligible = await isEligibleForCertificate(userId, courseId);
    if (!eligible) {
      await Certificate.deleteOne({ _id: cert._id });
      return res.status(404).json({ hasCertificate: false });
    }

    res.json({
      hasCertificate: true,
      certificate: cert,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
