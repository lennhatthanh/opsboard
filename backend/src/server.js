import { app } from "./app.js";
import { config } from "./config.js";
import { checkDatabase, pool } from "./db/pool.js";

const start = async () => {
  await checkDatabase();
  const server = app.listen(config.port, () => {
    console.log(JSON.stringify({ level: "info", message: "server_started", port: config.port }));
  });

  const shutdown = (signal) => {
    console.log(JSON.stringify({ level: "info", message: "shutdown_started", signal }));
    server.close(async () => {
      await pool.end();
      process.exit(0);
    });
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
};

start().catch((error) => {
  console.error(JSON.stringify({ level: "fatal", message: "startup_failed", error: error.message }));
  process.exit(1);
});

