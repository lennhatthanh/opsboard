import "dotenv/config";

export const config = {
  port: Number(process.env.PORT || 4000),
  nodeEnv: process.env.NODE_ENV || "development",
  databaseUrl:
    process.env.DATABASE_URL ||
    "postgresql://opsboard:opsboard@127.0.0.1:5433/opsboard",
  frontendUrl: process.env.FRONTEND_URL || "http://localhost:5173",
};
