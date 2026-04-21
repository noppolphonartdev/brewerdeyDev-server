const User = require("../models/User");
const QuizSubmission = require("../models/QuizSubmission");

// หมายเหตุ:
// - ตาม requirement ใหม่ "ลบบทบาทออก" และ "ยืนยันอีเมลให้สมาชิกกดลิงก์เอง"
// - ฝั่งแอดมินแก้ไขได้เฉพาะชื่อ/นามสกุล (ห้ามแก้ไขอีเมล)
const ALLOWED_FIELDS = ["name", "lastname"];

exports.getMembers = async (req, res) => {
  try {
    const members = await User.find().select("-password").sort({ _id: -1 });
    res.json(members);
  } catch (err) {
    res
      .status(500)
      .json({ message: "เกิดข้อผิดพลาดในการโหลดสมาชิก", error: err.message });
  }
};

exports.updateMember = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = {};

    ALLOWED_FIELDS.forEach((field) => {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    });

    const updated = await User.findByIdAndUpdate(id, updates, {
      returnDocument: "after",
      runValidators: true,
    }).select("-password");

    if (!updated) {
      return res.status(404).json({ message: "ไม่พบข้อมูลสมาชิก" });
    }

    res.json(updated);
  } catch (err) {
    res
      .status(500)
      .json({ message: "เกิดข้อผิดพลาดในการอัปเดตสมาชิก", error: err.message });
  }
};

// GET /api/admin/members/:id/quiz-stats
// รวมสถิติ Pre-test / Post-test ของสมาชิกแยกตามคอร์ส
exports.getMemberQuizStats = async (req, res) => {
  try {
    const { id } = req.params;

    // กันกรณี user ไม่อยู่
    const user = await User.findById(id).select(
      "_id name lastname email verified",
    );
    if (!user) return res.status(404).json({ message: "ไม่พบข้อมูลสมาชิก" });

    const submissions = await QuizSubmission.find({ userId: id })
      .populate("courseId", "title")
      .sort({ updatedAt: -1 });

    // จัดรูปแบบ: 1 คอร์ส มี pre/post
    const map = new Map();
    for (const s of submissions) {
      const course = s.courseId;
      if (!course) continue;

      const key = String(course._id);
      if (!map.has(key)) {
        map.set(key, {
          courseId: course._id,
          title: course.title,
          pre: null,
          post: null,
          updatedAt: s.updatedAt,
        });
      }

      const row = map.get(key);
      const payload = {
        attemptCount: s.attemptCount,
        bestScore: s.bestScore,
        lastScore: s.lastScore,
        total: s.total,
        passed: s.passed,
        updatedAt: s.updatedAt,
      };

      if (s.type === "pre") row.pre = payload;
      if (s.type === "post") row.post = payload;
      if (s.updatedAt > row.updatedAt) row.updatedAt = s.updatedAt;
    }

    const courses = Array.from(map.values()).sort(
      (a, b) => new Date(b.updatedAt) - new Date(a.updatedAt),
    );

    res.json({ user, courses });
  } catch (err) {
    res.status(500).json({
      message: "เกิดข้อผิดพลาดในการโหลดคะแนนสมาชิก",
      error: err.message,
    });
  }
};
