const { v2: cloudinary } = require("cloudinary");

let isConfigured = false;

const getCloudinaryEnv = () => ({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const configureCloudinary = () => {
  if (isConfigured) return true;

  const env = getCloudinaryEnv();
  const hasCloudinaryConfig =
    !!env.cloud_name && !!env.api_key && !!env.api_secret;

  if (!hasCloudinaryConfig) return false;

  cloudinary.config({
    ...env,
    secure: true,
  });
  isConfigured = true;
  return true;
};

const ensureCloudinaryConfig = () => {
  if (configureCloudinary()) return;
  throw new Error(
    "Cloudinary config ยังไม่ครบ (CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET)",
  );
};

module.exports = {
  cloudinary,
  ensureCloudinaryConfig,
};
