const express = require("express");
const router = express.Router();
const verifyToken = require("../middleware/verifyToken");
const quizController = require("../controllers/quizController");

router.get("/:courseId/status", verifyToken, quizController.getQuizStatus);
router.post("/:courseId/pre", verifyToken, quizController.submitPreTest);
router.post("/:courseId/post", verifyToken, quizController.submitPostTest);

module.exports = router;