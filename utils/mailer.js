const { Resend } = require("resend");

const resend = new Resend(process.env.RESEND_API_KEY);

const sendMail = async ({ to, subject, text, html }) => {
  const { RESEND_API_KEY, EMAIL_FROM } = process.env;

  if (!RESEND_API_KEY) {
    console.warn("RESEND_API_KEY not configured in .env -> skipping email");
    return false;
  }

  try {
    await resend.emails.send({
      from: EMAIL_FROM || "onboarding@resend.dev",
      to,
      subject,
      text,
      html,
    });

    return true;
  } catch (error) {
    console.error("Resend email error:", error);
    return false;
  }
};

module.exports = { sendMail };
