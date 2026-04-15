const SibApiV3Sdk = require("sib-api-v3-sdk");

const sendMail = async ({ to, subject, text, html }) => {
  const { BREVO_API_KEY, EMAIL_FROM } = process.env;

  if (!BREVO_API_KEY) {
    console.warn("BREVO_API_KEY not configured in .env -> skipping email");
    return false;
  }

  try {
    const defaultClient = SibApiV3Sdk.ApiClient.instance;
    defaultClient.authentications["api-key"].apiKey = BREVO_API_KEY;

    const apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();
    const sendSmtpEmail = new SibApiV3Sdk.SendSmtpEmail();

    sendSmtpEmail.sender = { email: EMAIL_FROM || "noreply@yourdomain.com" };
    sendSmtpEmail.to = [{ email: to }];
    sendSmtpEmail.subject = subject;
    sendSmtpEmail.textContent = text;
    sendSmtpEmail.htmlContent = html;

    await apiInstance.sendTransacEmail(sendSmtpEmail);
    return true;
  } catch (error) {
    console.error("Brevo email error:", error);
    return false;
  }
};

module.exports = { sendMail };
