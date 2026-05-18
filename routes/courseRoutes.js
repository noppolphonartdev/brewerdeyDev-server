// routes/courseRoutes.js
const express = require("express");
const router = express.Router();

const Course = require("../models/Course");
const CourseQuiz = require("../models/CourseQuiz");
const CourseProgress = require("../models/CourseProgress");
const verifyToken = require("../middleware/verifyToken");
const isAdmin = require("../middleware/isAdmin");
const QuizSubmission = require("../models/QuizSubmission");
const Order = require("../models/Order");
const Certificate = require("../models/Certificate");

const isValidAnswerIndex = (value) =>
  Number.isInteger(value) && value >= 0 && value <= 3;

const lessonKeyRegex = /^\d+-\d+$/;

const toPlainLessons = (lessons) => {
  if (!lessons) return {};
  if (lessons instanceof Map) return Object.fromEntries(lessons.entries());
  if (typeof lessons === "object" && !Array.isArray(lessons)) return lessons;
  return {};
};

const normalizeLessonProgress = (value) => {
  const rawPct = Number(value?.pct);
  const pct = Number.isFinite(rawPct)
    ? Math.max(0, Math.min(100, Math.round(rawPct)))
    : 0;
  const done = Boolean(value?.done) || pct >= 95;

  return {
    pct,
    done,
    updatedAt: new Date(),
  };
};

const isValidLessonKey = (key, curriculum) => {
  if (!lessonKeyRegex.test(key)) return false;

  const [sectionIndexRaw, lessonIndexRaw] = key.split("-");
  const sectionIndex = Number(sectionIndexRaw);
  const lessonIndex = Number(lessonIndexRaw);

  if (!Number.isInteger(sectionIndex) || !Number.isInteger(lessonIndex)) {
    return false;
  }

  const sections = Array.isArray(curriculum) ? curriculum : [];
  const section = sections[sectionIndex];
  if (!section) return false;

  const lessons = Array.isArray(section.lessons) ? section.lessons : [];
  return !!lessons[lessonIndex];
};

const mergeLessonsProgress = (currentLessons, incomingLessons) => {
  const merged = { ...currentLessons };

  Object.entries(incomingLessons).forEach(([key, incomingValue]) => {
    const prev = merged[key] || {};
    const normalized = normalizeLessonProgress(incomingValue);
    const prevPct = Number(prev.pct) || 0;
    const pct = Math.max(prevPct, normalized.pct);
    const done = Boolean(prev.done) || normalized.done || pct >= 95;

    merged[key] = {
      pct,
      done,
      updatedAt: new Date(),
    };
  });

  return merged;
};

function validateQuizAnswers(answers, questions) {
  if (!Array.isArray(answers)) {
    return {
      valid: false,
      message: "รูปแบบคำตอบไม่ถูกต้อง กรุณาลองใหม่อีกครั้ง",
    };
  }

  const total = questions.length;
  if (answers.length !== total) {
    return {
      valid: false,
      message: `กรุณาตอบคำถามให้ครบทุกข้อ (${total} ข้อ) ก่อนส่ง`,
    };
  }

  const isObjectPayload =
    answers.length > 0 && typeof answers[0] === "object" && answers[0] !== null;

  if (isObjectPayload) {
    const questionIdSet = new Set(questions.map((q) => String(q._id)));
    const answeredQuestionIds = new Set();

    for (const answer of answers) {
      if (!answer || typeof answer !== "object") {
        return {
          valid: false,
          message: "รูปแบบคำตอบไม่ถูกต้อง กรุณาตอบใหม่อีกครั้ง",
        };
      }

      const questionId = String(answer.questionId || "");
      const answerIndex = answer.answerIndex;

      if (!questionIdSet.has(questionId)) {
        return {
          valid: false,
          message: "พบคำถามที่ไม่ถูกต้อง กรุณาลองทำแบบทดสอบใหม่",
        };
      }

      if (answeredQuestionIds.has(questionId)) {
        return {
          valid: false,
          message: "พบคำตอบซ้ำของบางข้อ กรุณาตรวจสอบและส่งใหม่",
        };
      }

      if (!isValidAnswerIndex(answerIndex)) {
        return {
          valid: false,
          message: "กรุณาตอบคำถามให้ครบทุกข้อก่อนส่ง",
        };
      }

      answeredQuestionIds.add(questionId);
    }

    if (answeredQuestionIds.size !== total) {
      return {
        valid: false,
        message: `กรุณาตอบคำถามให้ครบทุกข้อ (${total} ข้อ) ก่อนส่ง`,
      };
    }

    return { valid: true, isObjectPayload: true };
  }

  const allChoicesValid = answers.every((choice) => isValidAnswerIndex(choice));
  if (!allChoicesValid) {
    return {
      valid: false,
      message: "กรุณาตอบคำถามให้ครบทุกข้อก่อนส่ง",
    };
  }

  return { valid: true, isObjectPayload: false };
}

// =======================
// PUBLIC ROUTES
// =======================

// GET /api/courses  => ดึงคอร์สทั้งหมด
router.get("/", async (req, res) => {
  try {
    const courses = await Course.find();
    res.json(courses);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/courses/:id
// => ดึงคอร์สตัวเดียว + preTest / postTest จาก CourseQuiz มาติดให้ด้วย
router.get("/:id", async (req, res) => {
  try {
    const course = await Course.findById(req.params.id).lean();
    if (!course) return res.status(404).json({ error: "Course not found" });

    const quizDoc = await CourseQuiz.findOne({ courseId: course._id }).lean();
    course.preTest = quizDoc?.preTest || [];
    course.postTest = quizDoc?.postTest || [];

    res.json(course);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/courses/:id/progress => ดึง progress การดูวิดีโอของผู้ใช้ในคอร์สนี้
router.get("/:id/progress", verifyToken, async (req, res) => {
  try {
    const course = await Course.findById(req.params.id).select("_id");
    if (!course) return res.status(404).json({ message: "Course not found" });

    const progress = await CourseProgress.findOne({
      userId: req.user.id,
      courseId: req.params.id,
    });

    return res.json({
      lessons: toPlainLessons(progress?.lessons),
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// PUT /api/courses/:id/progress => อัปเดต progress การดูวิดีโอของผู้ใช้ในคอร์สนี้
router.put("/:id/progress", verifyToken, async (req, res) => {
  try {
    const { lessons } = req.body || {};

    if (!lessons || typeof lessons !== "object" || Array.isArray(lessons)) {
      return res.status(400).json({
        message: "รูปแบบข้อมูล progress ไม่ถูกต้อง",
      });
    }

    const course = await Course.findById(req.params.id).select(
      "_id curriculum",
    );
    if (!course) return res.status(404).json({ message: "Course not found" });

    const incomingLessons = {};
    for (const [key, value] of Object.entries(lessons)) {
      if (!isValidLessonKey(key, course.curriculum)) continue;
      incomingLessons[key] = normalizeLessonProgress(value);
    }

    const existing = await CourseProgress.findOne({
      userId: req.user.id,
      courseId: req.params.id,
    });
    const currentLessons = toPlainLessons(existing?.lessons);
    const mergedLessons = mergeLessonsProgress(currentLessons, incomingLessons);

    const saved = await CourseProgress.findOneAndUpdate(
      {
        userId: req.user.id,
        courseId: req.params.id,
      },
      {
        $set: {
          lessons: mergedLessons,
        },
      },
      {
        upsert: true,
        returnDocument: "after",
        setDefaultsOnInsert: true,
      },
    );

    return res.json({
      lessons: toPlainLessons(saved?.lessons),
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// =======================
// ADMIN ROUTES
// =======================

// POST /api/courses => สร้างคอร์ส + upsert ข้อสอบ CourseQuiz
router.post("/", verifyToken, isAdmin, async (req, res) => {
  try {
    const { preTest, postTest, ...courseData } = req.body;

    const newCourse = new Course(courseData);
    const savedCourse = await newCourse.save();

    if (
      (Array.isArray(preTest) && preTest.length > 0) ||
      (Array.isArray(postTest) && postTest.length > 0)
    ) {
      await CourseQuiz.findOneAndUpdate(
        { courseId: savedCourse._id },
        {
          courseId: savedCourse._id,
          preTest: Array.isArray(preTest) ? preTest : [],
          postTest: Array.isArray(postTest) ? postTest : [],
        },
        { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
      );
    }

    res.status(201).json(savedCourse);
  } catch (err) {
    console.error("Create course error:", err);
    res.status(400).json({ error: err.message });
  }
});

// PUT /api/courses/:id => แก้คอร์ส + แก้ข้อสอบ CourseQuiz
router.put("/:id", verifyToken, isAdmin, async (req, res) => {
  try {
    const { preTest, postTest, ...courseData } = req.body;

    const hasCourseData = Object.keys(courseData).length > 0;
    let updatedCourse;

    if (hasCourseData) {
      updatedCourse = await Course.findByIdAndUpdate(
        req.params.id,
        courseData,
        {
          returnDocument: "after",
          runValidators: true,
        },
      );
    } else {
      updatedCourse = await Course.findById(req.params.id);
    }

    if (!updatedCourse) {
      return res.status(404).json({ error: "Course not found" });
    }

    const quizUpdate = { courseId: req.params.id };
    let shouldUpdateQuiz = false;

    if (Array.isArray(preTest)) {
      quizUpdate.preTest = preTest;
      shouldUpdateQuiz = true;
    }
    if (Array.isArray(postTest)) {
      quizUpdate.postTest = postTest;
      shouldUpdateQuiz = true;
    }

    if (shouldUpdateQuiz) {
      await CourseQuiz.findOneAndUpdate(
        { courseId: req.params.id },
        quizUpdate,
        { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
      );
    }

    res.json(updatedCourse);
  } catch (err) {
    console.error("Update course error:", err);
    res.status(400).json({ error: err.message });
  }
});

// PATCH /api/courses/:id/certificate-status => เปิด/ปิดการออก certificate รายคอร์ส
router.patch(
  "/:id/certificate-status",
  verifyToken,
  isAdmin,
  async (req, res) => {
    try {
      const { certificateEnabled } = req.body || {};
      if (typeof certificateEnabled !== "boolean") {
        return res.status(400).json({
          error: "certificateEnabled ต้องเป็น boolean",
        });
      }

      const updatedCourse = await Course.findByIdAndUpdate(
        req.params.id,
        { certificateEnabled },
        {
          returnDocument: "after",
          runValidators: true,
        },
      );

      if (!updatedCourse) {
        return res.status(404).json({ error: "Course not found" });
      }

      return res.json(updatedCourse);
    } catch (err) {
      console.error("Update course certificate status error:", err);
      return res.status(500).json({ error: err.message });
    }
  },
);

// DELETE /api/courses/:id => ลบคอร์ส + ลบชุดข้อสอบ
router.delete("/:id", verifyToken, isAdmin, async (req, res) => {
  try {
    const deletedCourse = await Course.findByIdAndDelete(req.params.id);
    if (!deletedCourse) {
      return res.status(404).json({ error: "Course not found" });
    }

    await CourseQuiz.findOneAndDelete({ courseId: req.params.id });
    res.status(200).json({ message: "คอร์สถูกลบแล้ว" });
  } catch (err) {
    console.error("Delete course error:", err);
    res.status(500).json({ error: err.message });
  }
});

// =======================
// QUIZ STATUS (ของผู้ใช้)
// GET /api/courses/:id/quiz/status
// =======================
router.get("/:id/quiz/status", verifyToken, async (req, res) => {
  try {
    const [pre, post] = await Promise.all([
      QuizSubmission.findOne({
        userId: req.user.id,
        courseId: req.params.id,
        type: "pre",
      }),
      QuizSubmission.findOne({
        userId: req.user.id,
        courseId: req.params.id,
        type: "post",
      }),
    ]);

    res.json({
      pre: pre
        ? {
            attemptCount: pre.attemptCount,
            bestScore: pre.bestScore,
            lastScore: pre.lastScore,
            total: pre.total,
            passed: pre.passed,
          }
        : null,
      post: post
        ? {
            attemptCount: post.attemptCount,
            bestScore: post.bestScore,
            lastScore: post.lastScore,
            total: post.total,
            passed: post.passed,
          }
        : null,
    });
  } catch (err) {
    console.error("Get quiz status error:", err);
    res.status(500).json({ error: err.message });
  }
});

// =======================
// SUBMIT QUIZ (pre / post)
// POST /api/courses/:id/quiz/:type
// body (แนะนำ): { answers: [{questionId, answerIndex}, ...] }
// รองรับของเก่า: { answers: [Number, ...] }
// =======================
router.post("/:id/quiz/:type", verifyToken, async (req, res) => {
  try {
    const { type } = req.params; // 'pre' | 'post'
    const { answers = [] } = req.body;

    if (!["pre", "post"].includes(type)) {
      return res.status(400).json({ message: "invalid type" });
    }

    const course = await Course.findById(req.params.id);
    if (!course) return res.status(404).json({ message: "Course not found" });

    const quizConfig = await CourseQuiz.findOne({ courseId: course._id });
    if (!quizConfig) {
      return res
        .status(400)
        .json({ message: "no quiz config for this course" });
    }

    const questions =
      type === "pre" ? quizConfig.preTest || [] : quizConfig.postTest || [];

    const total = questions.length;
    if (!total) return res.status(400).json({ message: "no questions" });

    const validation = validateQuizAnswers(answers, questions);
    if (!validation.valid) {
      return res.status(400).json({ message: validation.message });
    }

    // ถ้าคอร์สนี้ requirePreTest = true → ห้ามทำ post ถ้ายังไม่เคยทำ pre
    if (type === "post" && quizConfig.requirePreTest) {
      const pre = await QuizSubmission.findOne({
        userId: req.user.id,
        courseId: course._id,
        type: "pre",
      });

      if (!pre) {
        return res.status(400).json({
          message: "ต้องทำ Pre-test ก่อนถึงจะทำ Post-test ได้",
        });
      }
    }

    // passingScorePercent จาก CourseQuiz (default = 80%)
    const passingPercent =
      typeof quizConfig.passingScorePercent === "number"
        ? quizConfig.passingScorePercent
        : 70;

    const passThreshold = Math.ceil((passingPercent / 100) * total);

    // หา record เดิมของผู้ใช้
    let record = await QuizSubmission.findOne({
      userId: req.user.id,
      courseId: course._id,
      type,
    });

    if (type === "pre") {
      // preTest ทำได้ครั้งเดียว
      if (record && record.attemptCount >= 1) {
        return res.status(400).json({ message: "preTest ทำได้ครั้งเดียว" });
      }
    } else {
      // postTest ทำได้หลายครั้งจนกว่าจะ "ผ่าน"
      if (record && record.passed) {
        return res
          .status(400)
          .json({ message: "postTest ผ่านแล้ว ไม่สามารถทำซ้ำ" });
      }
    }

    // =========================
    // ตรวจคำตอบด้วย questionId (รองรับการ shuffle)
    // - ถ้า answers เป็น object array -> map ตาม questionId
    // - ถ้า answers เป็น number array -> fallback ตรวจตาม index แบบเดิม
    // =========================
    let score = 0;

    const { isObjectPayload } = validation;

    if (isObjectPayload) {
      // สร้าง map: questionId -> answerIndex
      const ansMap = new Map();
      for (const a of answers) {
        const qid = a?.questionId;
        const idx = typeof a?.answerIndex === "number" ? a.answerIndex : -1;
        if (qid) ansMap.set(String(qid), idx);
      }

      // ตรวจทีละข้อด้วย _id ของข้อสอบใน DB
      questions.forEach((q) => {
        const userAns = ansMap.get(String(q._id));
        if (typeof userAns === "number" && userAns === Number(q.correctIndex)) {
          score++;
        }
      });
    } else {
      // fallback แบบเดิม (ไม่รองรับ shuffle)
      questions.forEach((q, i) => {
        if (Number(answers[i]) === Number(q.correctIndex)) score++;
      });
    }

    const passed = score >= passThreshold;

    // บันทึก (upsert) QuizSubmission
    if (!record) {
      record = await QuizSubmission.create({
        userId: req.user.id,
        courseId: course._id,
        type,
        attemptCount: 1,
        bestScore: score,
        lastScore: score,
        total,
        passed: type === "post" ? passed : false,
        attempts: [{ score, total, answers }], // เก็บ payload ตามที่ส่งมา
      });
    } else {
      record.attemptCount += 1;
      record.lastScore = score;
      record.total = total;
      if (score > record.bestScore) record.bestScore = score;

      if (type === "post" && passed) record.passed = true;

      record.attempts.push({ score, total, answers }); // เก็บ payload ตามที่ส่งมา
      await record.save();
    }

    // ออก certificate เฉพาะ post และผ่าน
    let cert = null;
    if (type === "post" && passed) {
      cert = await issueCertificateIfEligible(req.user.id, course._id);
    }

    return res.json({
      type,
      score,
      total,
      passed,
      attemptCount: record.attemptCount,
      bestScore: record.bestScore,
      passThreshold,
      certificateIssued: !!cert,
      certificateId: cert?._id || null,
    });
  } catch (err) {
    console.error("Submit quiz error:", err);
    res.status(500).json({ error: err.message });
  }
});

// =======================
// ฟังก์ชันออก Certificate ถ้าเข้าเงื่อนไข
// =======================
async function issueCertificateIfEligible(userId, courseId) {
  const course = await Course.findById(courseId).select("certificateEnabled");
  if (!course || !course.certificateEnabled) return null;

  // 1) ต้องมี order paid ก่อน
  const paidOrder = await Order.findOne({
    userId,
    courseId,
    paymentStatus: "paid",
  }).sort({ purchaseDate: 1 });

  if (!paidOrder) return null;

  // 2) ต้องมี pre + post และ post ผ่าน
  const pre = await QuizSubmission.findOne({ userId, courseId, type: "pre" });
  const post = await QuizSubmission.findOne({ userId, courseId, type: "post" });
  if (!pre || !post) return null;
  if (!post.passed) return null;

  // 3) ดึง passingPercent จาก CourseQuiz ให้ถูกต้อง
  const quizConfig = await CourseQuiz.findOne({ courseId }); // แก้จาก findById(courseId)
  const passingPercent =
    typeof quizConfig?.passingScorePercent === "number"
      ? quizConfig.passingScorePercent
      : 70;

  const postPercent = post.total > 0 ? (post.bestScore / post.total) * 100 : 0;
  if (postPercent < passingPercent) return null;

  // 4) upsert certificate
  const code =
    "CERT-" +
    (courseId.toString().slice(-4) || "XXXX") +
    "-" +
    Date.now().toString(36).toUpperCase();

  const cert = await Certificate.findOneAndUpdate(
    { userId, courseId },
    {
      $setOnInsert: { certificateCode: code },
      $set: {
        orderId: paidOrder._id,
        preTestScore: pre.lastScore || 0,
        preTestTotal: pre.total || 0,
        postTestScore: post.bestScore || 0,
        postTestTotal: post.total || 0,
        passingScorePercent: passingPercent,
        issuedAt: new Date(),
      },
    },
    { returnDocument: "after", upsert: true },
  );

  return cert;
}

module.exports = router;
