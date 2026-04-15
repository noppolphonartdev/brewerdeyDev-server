const QuizSubmission = require("../models/QuizSubmission");
const CourseQuiz = require("../models/CourseQuiz");
const Order = require("../models/Order");
const Certificate = require("../models/Certificate");

/* --------------------------------------------
 * helper: แปลง answers ให้ตรวจได้ทั้ง 2 แบบ
 * --------------------------------------------*/
function buildAnswerResolver(answersRaw = []) {
  const answers = Array.isArray(answersRaw) ? answersRaw : [];

  if (answers.length && typeof answers[0] === "object" && answers[0] !== null) {
    const map = new Map();
    for (const a of answers) {
      const qid = a?.questionId;
      const idx = typeof a?.answerIndex === "number" ? a.answerIndex : -1;
      if (qid) map.set(String(qid), idx);
    }
    return {
      mode: "byId",
      getAnswerByQuestion: (q) => map.get(String(q._id)) ?? -1,
      savePayload: answers,
    };
  }

  return {
    mode: "byIndex",
    getAnswerByIndex: (_, i) => (typeof answers[i] === "number" ? answers[i] : -1),
    savePayload: answers,
  };
}

const isValidAnswerIndex = (value) =>
  Number.isInteger(value) && value >= 0 && value <= 3;

function validateQuizAnswers(answersRaw, quizItems) {
  const answers = Array.isArray(answersRaw) ? answersRaw : [];
  const total = quizItems.length;

  if (!Array.isArray(answersRaw)) {
    return {
      valid: false,
      message: "รูปแบบคำตอบไม่ถูกต้อง กรุณาลองใหม่อีกครั้ง",
    };
  }

  if (answers.length !== total) {
    return {
      valid: false,
      message: `กรุณาตอบคำถามให้ครบทุกข้อ (${total} ข้อ) ก่อนส่ง`,
    };
  }

  const isObjectPayload =
    answers.length > 0 && typeof answers[0] === "object" && answers[0] !== null;

  if (isObjectPayload) {
    const questionIdSet = new Set(quizItems.map((q) => String(q._id)));
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

    return { valid: true };
  }

  const allChoicesValid = answers.every((answerIndex) =>
    isValidAnswerIndex(answerIndex),
  );
  if (!allChoicesValid) {
    return {
      valid: false,
      message: "กรุณาตอบคำถามให้ครบทุกข้อก่อนส่ง",
    };
  }

  return { valid: true };
}

/* --------------------------------------------
 * helper: คำนวณคะแนนจาก quizItems + answers
 * -------------------------------------------- */
function computeScore(quizItems, resolver) {
  let score = 0;
  const total = quizItems.length;

  quizItems.forEach((q, i) => {
    const userAns =
      resolver.mode === "byId"
        ? resolver.getAnswerByQuestion(q)
        : resolver.getAnswerByIndex(q, i);

    // กันค่าเพี้ยน
    if (typeof userAns === "number" && userAns >= 0 && userAns <= 3) {
      if (userAns === q.correctIndex) score++;
    }
  });

  return { score, total };
}

/* --------------------------------------------
 * ออก Certificate ถ้าเข้าเงื่อนไข
 * -------------------------------------------- */
async function issueCertificateIfEligible(userId, courseId) {
  // 1) เช็คว่ามี Order paid แล้ว
  const paidOrder = await Order.findOne({
    userId,
    courseId,
    paymentStatus: "paid",
  }).sort({ purchaseDate: 1 });

  if (!paidOrder) return null;

  // 2) ต้องมีผล pre + post
  const pre = await QuizSubmission.findOne({ userId, courseId, type: "pre" });
  const post = await QuizSubmission.findOne({ userId, courseId, type: "post" });
  if (!pre || !post) return null;
  if (!post.passed) return null;

  // 3) เกณฑ์ผ่านจาก CourseQuiz
  const cq = await CourseQuiz.findOne({ courseId });
  const passingPercent = cq?.passingScorePercent ?? 70;

  const postPercent = post.total > 0 ? (post.bestScore / post.total) * 100 : 0;
  if (postPercent < passingPercent) return null;

  // 4) upsert Certificate
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
        preTestScore: pre.lastScore,
        preTestTotal: pre.total,
        postTestScore: post.bestScore,
        postTestTotal: post.total,
        passingScorePercent: passingPercent,
        issuedAt: new Date(),
      },
    },
    { new: true, upsert: true }
  );

  return cert;
}

/* --------------------------------------------
 * GET /api/quiz/:courseId/status
 * -------------------------------------------- */
exports.getQuizStatus = async (req, res) => {
  try {
    const userId = req.user.id;
    const { courseId } = req.params;

    const cq = await CourseQuiz.findOne({ courseId });
    if (!cq) {
      return res.json({
        pre: { attemptCount: 0, lastScore: 0, bestScore: 0, total: 0 },
        post: { attemptCount: 0, lastScore: 0, bestScore: 0, total: 0, passed: false },
      });
    }

    const preTotal = cq.preTest?.length ?? 0;
    const postTotal = cq.postTest?.length ?? 0;

    const pre = await QuizSubmission.findOne({ userId, courseId, type: "pre" });
    const post = await QuizSubmission.findOne({ userId, courseId, type: "post" });

    res.json({
      pre: pre
        ? {
            attemptCount: pre.attemptCount,
            lastScore: pre.lastScore,
            bestScore: pre.bestScore,
            total: pre.total || preTotal,
          }
        : { attemptCount: 0, lastScore: 0, bestScore: 0, total: preTotal },

      post: post
        ? {
            attemptCount: post.attemptCount,
            lastScore: post.lastScore,
            bestScore: post.bestScore,
            total: post.total || postTotal,
            passed: !!post.passed,
          }
        : { attemptCount: 0, lastScore: 0, bestScore: 0, total: postTotal, passed: false },
    });
  } catch (err) {
    res.status(500).json({ message: err.message || "Server error" });
  }
};

/* --------------------------------------------
 * POST /api/quiz/:courseId/pre
 * -------------------------------------------- */
exports.submitPreTest = async (req, res) => {
  try {
    const userId = req.user.id;
    const { courseId } = req.params;
    const { answers } = req.body;

    const cq = await CourseQuiz.findOne({ courseId });
    if (!cq) return res.status(404).json({ message: "ไม่พบชุดข้อสอบของคอร์สนี้" });

    const quizItems = cq.preTest || [];
    if (!quizItems.length) return res.status(400).json({ message: "คอร์สนี้ยังไม่มีข้อสอบ pre-test" });

    const validation = validateQuizAnswers(answers, quizItems);
    if (!validation.valid) {
      return res.status(400).json({ message: validation.message });
    }

    // ถ้าต้องการให้ pre-test ทำครั้งเดียว
    if (cq.requirePreTest) {
      const existing = await QuizSubmission.findOne({ userId, courseId, type: "pre" });
      if (existing?.attemptCount >= 1) {
        return res.status(400).json({ message: "Pre-test ทำได้ครั้งเดียว" });
      }
    }

    const resolver = buildAnswerResolver(answers);
    const { score, total } = computeScore(quizItems, resolver);

    const submission = await QuizSubmission.findOneAndUpdate(
      { userId, courseId, type: "pre" },
      {
        $set: { total },
        $inc: { attemptCount: 1 },
        $setOnInsert: { bestScore: score, lastScore: score },
      },
      { new: true, upsert: true }
    );

    submission.lastScore = score;
    if (score > submission.bestScore) submission.bestScore = score;

    // pre-test ส่วนใหญ่ไม่บังคับ passed แต่เก็บไว้ได้
    submission.passed = false;

    submission.attempts.push({ score, total, answers: resolver.savePayload });
    await submission.save();

    res.json({ score, total });
  } catch (err) {
    res.status(500).json({ message: err.message || "Server error" });
  }
};

/* --------------------------------------------
 * POST /api/quiz/:courseId/post
 * -------------------------------------------- */
exports.submitPostTest = async (req, res) => {
  try {
    const userId = req.user.id;
    const { courseId } = req.params;
    const { answers } = req.body;

    const cq = await CourseQuiz.findOne({ courseId });
    if (!cq) return res.status(404).json({ message: "ไม่พบชุดข้อสอบของคอร์สนี้" });

    const quizItems = cq.postTest || [];
    if (!quizItems.length) return res.status(400).json({ message: "คอร์สนี้ยังไม่มีข้อสอบ post-test" });

    const validation = validateQuizAnswers(answers, quizItems);
    if (!validation.valid) {
      return res.status(400).json({ message: validation.message });
    }

    // ถ้าคุณต้องการกันทำซ้ำหลังผ่านแล้ว
    const existing = await QuizSubmission.findOne({ userId, courseId, type: "post" });
    if (existing?.passed) {
      return res.status(400).json({ message: "คุณผ่าน Post-test แล้ว" });
    }

    const passingPercent = cq.passingScorePercent ?? 70;

    const resolver = buildAnswerResolver(answers);
    const { score, total } = computeScore(quizItems, resolver);

    const passed = total > 0 ? (score / total) * 100 >= passingPercent : false;

    const submission = await QuizSubmission.findOneAndUpdate(
      { userId, courseId, type: "post" },
      {
        $set: { total },
        $inc: { attemptCount: 1 },
        $setOnInsert: { bestScore: score, lastScore: score },
      },
      { new: true, upsert: true }
    );

    submission.lastScore = score;
    if (score > submission.bestScore) submission.bestScore = score;
    submission.passed = passed;

    submission.attempts.push({ score, total, answers: resolver.savePayload });
    await submission.save();

    // ผ่านแล้วค่อยลองออก certificate
    const cert = passed ? await issueCertificateIfEligible(userId, courseId) : null;

    res.json({
      score,
      total,
      passed,
      certificateIssued: !!cert,
      certificateId: cert?._id || null,
    });
  } catch (err) {
    res.status(500).json({ message: err.message || "Server error" });
  }
};
