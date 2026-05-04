import { env } from "./env.js";
import { logger } from "./logger.js";
import { createApp } from "./app.js";

const app = createApp();

app.listen(env.PORT, () => {
  logger.info(`Server running on port ${env.PORT} [${env.NODE_ENV}]`);
});
