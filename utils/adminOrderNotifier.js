const Admin = require("../models/AdminModel");
const Notification = require("../models/Notification");
const { sendMail } = require("./mailer");

const parseAdminNotifyEmails = () => {
  const raw = process.env.ADMIN_NOTIFY_EMAIL || "";
  return raw
    .split(",")
    .map((email) => email.trim())
    .filter(Boolean);
};

const notifyAdminsInApp = async ({
  title,
  message,
  type,
  link = "/admin/orders",
}) => {
  const admins = await Admin.find({}, "_id").lean();

  if (!admins.length) {
    console.warn(
      "ไม่พบ Admin account ในฐานข้อมูล -> ข้าม in-app admin notification",
    );
    return 0;
  }

  const docs = admins.map((admin) => ({
    adminId: admin._id,
    recipientType: "admin",
    type,
    title,
    message,
    link,
    isRead: false,
  }));

  await Notification.insertMany(docs, { ordered: false });
  return docs.length;
};

const notifyAdminsAboutNewOrder = async ({ order, user }) => {
  const courseTitle = order?.courseId?.title || "คอร์สที่ถูกสั่งซื้อ";
  const buyerName =
    `${user?.name || ""} ${user?.lastname || ""}`.trim() ||
    order?.customerName ||
    "ผู้ใช้งาน";
  const buyerEmail = user?.email || order?.customerEmail || "-";
  const totalPrice = Number(order?.totalPrice || 0).toLocaleString();
  const orderId = String(order?._id || "");
  const appUrl = process.env.APP_URL || "http://localhost:5173";

  // ไม่ต้องสร้าง in-app สำหรับ "มีคำสั่งซื้อใหม่" ตาม requirement ล่าสุด
  // (ยังคงส่งอีเมลแจ้งแอดมินปกติ)

  // 2) ส่งเมลแจ้ง admin
  const emails = parseAdminNotifyEmails();
  if (emails.length === 0) {
    console.warn(
      "ยังไม่ได้ตั้ง ADMIN_NOTIFY_EMAIL ใน .env -> ข้ามการส่งเมลแจ้งแอดมิน (new order)",
    );
    return;
  }

  try {
    await sendMail({
      to: emails.join(", "),
      subject: "[BrewerDev] มีออเดอร์ใหม่ 🛒",
      text: `มีออเดอร์ใหม่\n\nOrder: ${orderId}\nคอร์ส: ${courseTitle}\nผู้ซื้อ: ${buyerName}\nอีเมลผู้ซื้อ: ${buyerEmail}\nยอดเงิน: ${totalPrice} บาท\nสถานะ: รอชำระเงิน\nตรวจสอบได้ที่: ${appUrl}/admin/orders`,
      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.6">
          <h2>มีออเดอร์ใหม่ 🛒</h2>
          <p><b>Order:</b> ${orderId}</p>
          <p><b>คอร์ส:</b> ${courseTitle}</p>
          <p><b>ผู้ซื้อ:</b> ${buyerName}</p>
          <p><b>อีเมลผู้ซื้อ:</b> ${buyerEmail}</p>
          <p><b>ยอดเงิน:</b> ${totalPrice} บาท</p>
          <p><b>สถานะ:</b> <span style="color:orange">รอชำระเงิน</span></p>
          <p>ไปที่หน้าแอดมิน: <a href="${appUrl}/admin/orders">${appUrl}/admin/orders</a></p>
          <hr />
          <p style="color:#666;font-size:12px">BrewerDev</p>
        </div>
      `,
    });
  } catch (mailErr) {
    console.error("ส่งอีเมลแจ้งแอดมิน (new order) ไม่สำเร็จ:", mailErr);
  }
};

const notifyAdminsAboutSlipSubmission = async ({ order, user }) => {
  const courseTitle = order?.courseId?.title || "คอร์สที่ถูกสั่งซื้อ";
  const buyerName =
    `${user?.name || ""} ${user?.lastname || ""}`.trim() ||
    order?.customerName ||
    "ผู้ใช้งาน";
  const buyerEmail = user?.email || order?.customerEmail || "-";
  const totalPrice = Number(order?.totalPrice || 0).toLocaleString();
  const orderId = String(order?._id || "");
  const appUrl = process.env.APP_URL || "http://localhost:5173";
  const orderLink = orderId
    ? `/admin/orders?orderId=${encodeURIComponent(orderId)}`
    : "/admin/orders";

  try {
    await notifyAdminsInApp({
      type: "order_pending_review",
      title: "มีคำสั่งซื้อใหม่รอตรวจสลิป 💸",
      message: `${buyerName} ส่งสลิปคอร์ส \"${courseTitle}\" แล้ว (Order: ${orderId})`,
      link: orderLink,
    });
  } catch (err) {
    console.error(
      "สร้าง in-app admin notification (order_pending_review) ไม่สำเร็จ:",
      err,
    );
  }

  const emails = parseAdminNotifyEmails();
  if (emails.length === 0) {
    console.warn(
      "ยังไม่ได้ตั้ง ADMIN_NOTIFY_EMAIL ใน .env -> ข้ามการส่งเมลแจ้งแอดมิน",
    );
    return;
  }

  await sendMail({
    to: emails.join(", "),
    subject: "[BrewerDev] มีออเดอร์ใหม่รอตรวจสอบสลิป",
    text: `มีออเดอร์ใหม่รอตรวจสอบ\n\nOrder: ${orderId}\nคอร์ส: ${courseTitle}\nผู้ซื้อ: ${buyerName}\nอีเมลผู้ซื้อ: ${buyerEmail}\nยอดเงิน: ${totalPrice} บาท\nตรวจสอบได้ที่: ${appUrl}/admin/orders`,
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.6">
        <h2>มีออเดอร์ใหม่รอตรวจสอบสลิป 💸</h2>
        <p><b>Order:</b> ${orderId}</p>
        <p><b>คอร์ส:</b> ${courseTitle}</p>
        <p><b>ผู้ซื้อ:</b> ${buyerName}</p>
        <p><b>อีเมลผู้ซื้อ:</b> ${buyerEmail}</p>
        <p><b>ยอดเงิน:</b> ${totalPrice} บาท</p>
        <p>ไปที่หน้าแอดมิน: <a href="${appUrl}/admin/orders">${appUrl}/admin/orders</a></p>
        <hr />
        <p style="color:#666;font-size:12px">BrewerDev</p>
      </div>
    `,
  });
};

module.exports = {
  notifyAdminsAboutSlipSubmission,
  notifyAdminsAboutNewOrder,
};
