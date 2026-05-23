const emailService = require("./services/emailService");

(async () => {
  // wait 2 seconds to let transporter verify configuration
  await new Promise((resolve) => setTimeout(resolve, 2000));

  const result = await emailService.testConfiguration();
  console.log(result);
})();
