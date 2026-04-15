const nodemailer = require("nodemailer");

const sendMail = async ({ to, subject, text, html }) => {
  const { EMAIL_USER, EMAIL_PASS, MAIL_FROM } = process.env;

  if (!EMAIL_USER || !EMAIL_PASS) {
    console.warn(
      "ยังไม่ได้ตั้ง EMAIL_USER/EMAIL_PASS ใน .env -> ข้ามการส่งเมล",
    );
    return false;
  }

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: EMAIL_USER,
      pass: EMAIL_PASS,
    },
  });

  await transporter.sendMail({
    from: MAIL_FROM || `"CourseSi" <${EMAIL_USER}>`,
    to,
    subject,
    text,
    html,
  });

  return true;
};

module.exports = { sendMail };
