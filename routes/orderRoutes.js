const express = require("express");
const router = express.Router();
const Order = require("../models/Order");
const Course = require("../models/Course");
const User = require("../models/User");
const verifyToken = require("../middleware/verifyToken");
const isAdmin = require("../middleware/isAdmin");
const Notification = require("../models/Notification");
const { sendMail } = require("../utils/mailer");
const {
  notifyAdminsAboutSlipSubmission,
  notifyAdminsAboutNewOrder,
} = require("../utils/adminOrderNotifier");

const REPORT_TIMEZONE = "Asia/Bangkok";
const ALLOWED_REPORT_PERIODS = new Set(["daily", "monthly", "yearly"]);

const buildSaleDateMatch = (startDate, endDate) => {
  const dateMatch = {};

  if (startDate) {
    const start = new Date(startDate);
    if (Number.isNaN(start.getTime())) {
      return { error: "startDate ไม่ถูกต้อง" };
    }
    start.setHours(0, 0, 0, 0);
    dateMatch.$gte = start;
  }

  if (endDate) {
    const end = new Date(endDate);
    if (Number.isNaN(end.getTime())) {
      return { error: "endDate ไม่ถูกต้อง" };
    }
    end.setHours(23, 59, 59, 999);
    dateMatch.$lte = end;
  }

  if (dateMatch.$gte && dateMatch.$lte && dateMatch.$gte > dateMatch.$lte) {
    return {
      error: "ช่วงวันที่ไม่ถูกต้อง: startDate ต้องน้อยกว่าหรือเท่ากับ endDate",
    };
  }

  return {
    match: Object.keys(dateMatch).length ? dateMatch : null,
  };
};

const buildSaleDateStages = (saleDateMatch) => {
  const stages = [
    { $addFields: { saleDate: { $ifNull: ["$paidAt", "$purchaseDate"] } } },
  ];
  if (saleDateMatch) {
    stages.push({ $match: { saleDate: saleDateMatch } });
  }
  return stages;
};

const runOrderStatusSideEffects = async ({
  order,
  isPaidTransition,
  isRejectedTransition,
}) => {
  if (isPaidTransition) {
    const courseTitle = order.courseId?.title || "คอร์สของคุณ";
    const email = order.userId?.email || order.customerEmail;
    const targetUserId = order.userId?._id || order.userId || null;
    const appUrl = process.env.APP_URL || "http://localhost:5173";

    if (targetUserId) {
      try {
        await Notification.create({
          userId: targetUserId,
          recipientType: "user",
          type: "order",
          title: "อนุมัติการชำระเงินสำเร็จ ✅",
          message: `คำสั่งซื้อ "${courseTitle}" ได้รับการอนุมัติแล้ว คุณสามารถเข้าเรียนได้ทันที`,
          link: `/course/${order.courseId?._id}`,
          isRead: false,
        });
      } catch (notifyErr) {
        console.error("สร้างแจ้งเตือนผู้ใช้ (paid) ไม่สำเร็จ:", notifyErr);
      }
    } else {
      console.warn(
        "ข้ามการสร้างแจ้งเตือนผู้ใช้ (paid): ไม่พบ userId ของคำสั่งซื้อ",
        order._id,
      );
    }

    if (email) {
      try {
        await sendMail({
          to: email,
          subject: "BreweryDev: อนุมัติการชำระเงินสำเร็จ",
          text: `อนุมัติการชำระเงินสำเร็จสำหรับ "${courseTitle}" เข้าเรียนได้ที่ ${appUrl}/my-orders`,
          html: `
            <div style="font-family:Arial,sans-serif;line-height:1.6">
              <h2>อนุมัติการชำระเงินสำเร็จ ✅</h2>
              <p>คำสั่งซื้อคอร์ส <b>${courseTitle}</b> ได้รับการอนุมัติแล้ว</p>
              <p>คุณสามารถเข้าเรียนได้ทันทีที่หน้า <a href="${appUrl}/my-orders">${appUrl}/my-orders</a></p>
              <hr />
              <p style="color:#666;font-size:12px">BreweryDev</p>
            </div>
          `,
        });
      } catch (mailErr) {
        console.error("ส่งอีเมลผู้ใช้ (paid) ไม่สำเร็จ:", mailErr);
      }
    }
  }

  if (isRejectedTransition) {
    const courseTitle = order.courseId?.title || "คอร์สของคุณ";
    const email = order.userId?.email || order.customerEmail;
    const targetUserId = order.userId?._id || order.userId || null;
    const appUrl = process.env.APP_URL || "http://localhost:5173";

    const title = "คำสั่งซื้อถูกปฏิเสธ ❌";
    const message = `คำสั่งซื้อ "${courseTitle}" ถูกปฏิเสธโดยแอดมิน กรุณาตรวจสอบรายละเอียดที่หน้า คอร์สของฉัน`;

    if (targetUserId) {
      try {
        await Notification.create({
          userId: targetUserId,
          recipientType: "user",
          type: "order",
          title,
          message,
          link: "/my-orders",
          isRead: false,
        });
      } catch (notifyErr) {
        console.error("สร้างแจ้งเตือนผู้ใช้ (failed) ไม่สำเร็จ:", notifyErr);
      }
    } else {
      console.warn(
        "ข้ามการสร้างแจ้งเตือนผู้ใช้ (failed): ไม่พบ userId ของคำสั่งซื้อ",
        order._id,
      );
    }

    if (email) {
      try {
        await sendMail({
          to: email,
          subject: "BreweryDev: คำสั่งซื้อของคุณถูกปฏิเสธ",
          text: `${message}\nตรวจสอบได้ที่ ${appUrl}/my-orders`,
          html: `
            <div style="font-family:Arial,sans-serif;line-height:1.6">
              <h2>${title}</h2>
              <p>คำสั่งซื้อคอร์ส <b>${courseTitle}</b></p>
              <p>${message}</p>
              <p>ตรวจสอบรายละเอียดที่หน้า <a href="${appUrl}/my-orders">${appUrl}/my-orders</a></p>
              <hr />
              <p style="color:#666;font-size:12px">BreweryDev</p>
            </div>
          `,
        });
      } catch (mailErr) {
        console.error("ส่งอีเมลผู้ใช้ (failed) ไม่สำเร็จ:", mailErr);
      }
    }
  }
};

// GET /api/orders => ดูรายการคำสั่งซื้อทั้งหมดของผู้ใช้ที่ล็อกอิน
router.get("/", verifyToken, async (req, res) => {
  try {
    const orders = await Order.find({ userId: req.user.id }).populate(
      "courseId",
    );
    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/orders/admin/course-purchase-count => แอดมินดูจำนวนผู้ซื้อแยกตามคอร์ส
router.get(
  "/admin/course-purchase-count",
  verifyToken,
  isAdmin,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;
      const { match: saleDateMatch, error } = buildSaleDateMatch(
        startDate,
        endDate,
      );

      if (error) {
        return res.status(400).json({ message: error });
      }

      const coursePurchaseCount = await Order.aggregate([
        { $match: { paymentStatus: "paid" } },
        ...buildSaleDateStages(saleDateMatch),
        {
          $group: {
            _id: "$courseId",
            salesCount: { $sum: 1 },
            totalRevenue: { $sum: { $ifNull: ["$totalPrice", 0] } },
            buyerIds: { $addToSet: "$userId" },
          },
        },
        {
          $project: {
            _id: 1,
            salesCount: 1,
            totalRevenue: 1,
            uniqueBuyers: { $size: "$buyerIds" },
          },
        },
        { $sort: { uniqueBuyers: -1, totalRevenue: -1 } },
        {
          $lookup: {
            from: "courses",
            localField: "_id",
            foreignField: "_id",
            as: "course",
          },
        },
        { $unwind: { path: "$course", preserveNullAndEmptyArrays: true } },
        {
          $project: {
            _id: 0,
            courseId: "$_id",
            uniqueBuyers: 1,
            salesCount: 1,
            totalRevenue: 1,
            title: { $ifNull: ["$course.title", "คอร์สที่ถูกลบ"] },
            instructor: { $ifNull: ["$course.instructor", "-"] },
            price: { $ifNull: ["$course.price", 0] },
          },
        },
      ]);

      res.json(coursePurchaseCount);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },
);

// GET /api/orders/admin/sales-reports => รายงานยอดขายแบบรายวัน/รายเดือน/รายปี
router.get("/admin/sales-reports", verifyToken, isAdmin, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const period = String(req.query.period || "daily").toLowerCase();

    if (!ALLOWED_REPORT_PERIODS.has(period)) {
      return res
        .status(400)
        .json({ message: "period ต้องเป็น daily, monthly หรือ yearly" });
    }

    const { match: saleDateMatch, error } = buildSaleDateMatch(
      startDate,
      endDate,
    );

    if (error) {
      return res.status(400).json({ message: error });
    }

    const dateFormatByPeriod = {
      daily: "%Y-%m-%d",
      monthly: "%Y-%m",
      yearly: "%Y",
    };

    const [reportData] = await Order.aggregate([
      { $match: { paymentStatus: "paid" } },
      ...buildSaleDateStages(saleDateMatch),
      {
        $facet: {
          rows: [
            {
              $group: {
                _id: {
                  $dateToString: {
                    format: dateFormatByPeriod[period],
                    date: "$saleDate",
                    timezone: REPORT_TIMEZONE,
                  },
                },
                totalRevenue: { $sum: { $ifNull: ["$totalPrice", 0] } },
                totalOrders: { $sum: 1 },
                buyerIds: { $addToSet: "$userId" },
              },
            },
            {
              $project: {
                _id: 0,
                label: "$_id",
                totalRevenue: 1,
                totalOrders: 1,
                uniqueBuyers: { $size: "$buyerIds" },
              },
            },
            { $sort: { label: 1 } },
          ],
          summary: [
            {
              $group: {
                _id: null,
                totalRevenue: { $sum: { $ifNull: ["$totalPrice", 0] } },
                totalOrders: { $sum: 1 },
                buyerIds: { $addToSet: "$userId" },
              },
            },
            {
              $project: {
                _id: 0,
                totalRevenue: 1,
                totalOrders: 1,
                uniqueBuyers: { $size: "$buyerIds" },
              },
            },
          ],
        },
      },
    ]);

    const summary = reportData?.summary?.[0] || {
      totalRevenue: 0,
      totalOrders: 0,
      uniqueBuyers: 0,
    };

    res.json({
      period,
      startDate: startDate || null,
      endDate: endDate || null,
      rows: Array.isArray(reportData?.rows) ? reportData.rows : [],
      summary: {
        ...summary,
        avgOrderValue:
          summary.totalOrders > 0
            ? summary.totalRevenue / summary.totalOrders
            : 0,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/orders => สร้างคำสั่งซื้อใหม่ (ขั้นตอนแรกก่อนชำระเงิน)
router.post("/", verifyToken, async (req, res) => {
  try {
    const { courseId } = req.body;
    const userId = req.user.id;

    const user = await User.findById(userId).select(
      "name lastname email verified",
    );
    if (!user) {
      return res.status(404).json({ message: "ไม่พบข้อมูลผู้ใช้" });
    }

    if (!user.verified) {
      return res.status(403).json({
        message:
          "อีเมลนี้ยังไม่ได้ยืนยันที่อยู่อีเมล ไม่สามารถทำการสั่งซื้อได้ โปรดลองใหม่อีกครั้ง",
      });
    }

    const existingOrder = await Order.findOne({
      userId,
      courseId,
      paymentStatus: "paid",
    });
    if (existingOrder) {
      return res.status(400).json({ message: "คุณได้ซื้อคอร์สนี้ไปแล้ว" });
    }

    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({ message: "ไม่พบคอร์สที่ระบุ" });
    }

    const newOrder = new Order({
      courseId: courseId,
      userId: userId,
      totalPrice: course.price,
      customerName: `${user.name} ${user.lastname}`,
      customerEmail: user.email,
      paymentStatus: "pending",
      // สลิปเริ่มต้น
      slipUrl: "",
      slipUploadedAt: null,
      slipNote: "",
      reviewedBy: null,
      reviewedAt: null,
      paidAt: null,
    });

    await newOrder.save();

    const populated = await Order.findById(newOrder._id).populate("courseId");

    try {
      await notifyAdminsAboutNewOrder({
        order: populated,
        user: req.user,
      });
    } catch (notifyErr) {
      console.error("notifyAdminsAboutNewOrder error:", notifyErr);
    }

    res.status(201).json(populated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* =========================================================
 * USER: แนบสลิป
 * PATCH /api/orders/:id/upload-slip
 * body: { slipUrl, slipNote? }
 * ========================================================= */
router.patch("/:id/upload-slip", verifyToken, async (req, res) => {
  try {
    const { slipUrl, slipNote } = req.body;

    if (!slipUrl || typeof slipUrl !== "string") {
      return res.status(400).json({ message: "กรุณาแนบสลิปก่อน" });
    }

    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: "ไม่พบคำสั่งซื้อ" });

    // ต้องเป็นเจ้าของออเดอร์เท่านั้น
    if (String(order.userId) !== String(req.user.id)) {
      return res.status(403).json({ message: "ไม่มีสิทธิ์แก้ไขคำสั่งซื้อนี้" });
    }

    // กันกรณีชำระแล้ว
    if (order.paymentStatus === "paid") {
      return res
        .status(400)
        .json({ message: "คำสั่งซื้อนี้ชำระแล้ว ไม่สามารถแนบสลิปเพิ่มได้" });
    }

    order.slipUrl = slipUrl;
    order.slipUploadedAt = new Date();
    order.slipNote = typeof slipNote === "string" ? slipNote : order.slipNote;

    // แนบสลิปแล้วสถานะยังเป็น pending (รอแอดมินอนุมัติ)
    order.paymentStatus = "pending";

    await order.save();
    const populated = await Order.findById(order._id).populate("courseId");

    try {
      await notifyAdminsAboutSlipSubmission({
        order: populated,
        user: req.user,
      });
    } catch (notifyErr) {
      console.error("notifyAdminsAboutSlipSubmission error:", notifyErr);
    }

    res.json(populated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Admin Routes ---

// GET /api/orders/admin/all => แอดมินดูคำสั่งซื้อทั้งหมด
router.get("/admin/all", verifyToken, isAdmin, async (req, res) => {
  try {
    const orders = await Order.find()
      .populate("courseId")
      .populate("userId", "name email");
    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/orders/admin/top-courses => แอดมินดู 5 อันดับคอร์สขายดีที่สุด
router.get("/admin/top-courses", verifyToken, isAdmin, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const { match: saleDateMatch, error } = buildSaleDateMatch(
      startDate,
      endDate,
    );

    if (error) {
      return res.status(400).json({ message: error });
    }

    const topCourses = await Order.aggregate([
      { $match: { paymentStatus: "paid" } },
      ...buildSaleDateStages(saleDateMatch),
      {
        $group: {
          _id: "$courseId",
          salesCount: { $sum: 1 },
          totalRevenue: { $sum: "$totalPrice" },
        },
      },
      { $sort: { salesCount: -1, totalRevenue: -1 } },
      { $limit: 5 },
      {
        $lookup: {
          from: "courses",
          localField: "_id",
          foreignField: "_id",
          as: "course",
        },
      },
      { $unwind: { path: "$course", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 0,
          courseId: "$_id",
          salesCount: 1,
          totalRevenue: 1,
          title: { $ifNull: ["$course.title", "คอร์สที่ถูกลบ"] },
          instructor: { $ifNull: ["$course.instructor", "-"] },
          price: { $ifNull: ["$course.price", 0] },
        },
      },
    ]);

    res.json(topCourses);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/orders/:id/update-status => แอดมินอัปเดตสถานะการชำระเงิน
router.patch("/:id/update-status", verifyToken, isAdmin, async (req, res) => {
  try {
    const { status } = req.body;
    const allowedStatuses = ["pending", "paid", "failed"];

    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({
        message: "สถานะไม่ถูกต้อง (อนุญาตเฉพาะ pending, paid, failed)",
      });
    }

    // ดึง order เดิมมาก่อนเพื่อดูว่าเปลี่ยนสถานะจริงไหม
    const orderBefore = await Order.findById(req.params.id)
      .populate("courseId")
      .populate("userId", "name email");

    if (!orderBefore) return res.status(404).send("ไม่พบคำสั่งซื้อ");

    const prevStatus = orderBefore.paymentStatus;
    const hasStatusChanged = prevStatus !== status;
    const isPaidTransition = prevStatus !== "paid" && status === "paid";
    const isRejectedTransition = hasStatusChanged && status === "failed";

    // อัปเดตสถานะ
    orderBefore.paymentStatus = status;
    if (isPaidTransition) {
      orderBefore.paidAt = new Date();
    }
    await orderBefore.save();

    // ส่งกลับทันทีหลังบันทึกสถานะ เพื่อไม่ให้งานส่งเมล/แจ้งเตือนบล็อก response
    const updatedOrder = await Order.findById(orderBefore._id)
      .populate("courseId")
      .populate("userId", "name email");

    res.json(updatedOrder);

    if (hasStatusChanged) {
      runOrderStatusSideEffects({
        order: updatedOrder || orderBefore,
        isPaidTransition,
        isRejectedTransition,
      }).catch((sideEffectErr) => {
        console.error(
          "order update-status side-effects failed:",
          sideEffectErr,
        );
      });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/orders/:id => แอดมินลบคำสั่งซื้อ
router.delete("/:id", verifyToken, isAdmin, async (req, res) => {
  try {
    await Order.findByIdAndDelete(req.params.id);
    res.json({ message: "ลบคำสั่งซื้อสำเร็จ" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
