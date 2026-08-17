import "dotenv/config";
import path from "node:path";

function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Variabile d'ambiente mancante: ${name}. Copia .env.example in .env e compilala.`);
  }
  return value;
}

export const config = {
  PORT: Number(process.env.PORT || 3000),
  ADMIN_TOKEN: required("ADMIN_TOKEN"),
  PUBLIC_BASE_URL: (process.env.PUBLIC_BASE_URL || "http://localhost:3000").replace(/\/$/, ""),
  DATA_PATH: path.resolve(process.env.DATA_PATH || "./data/db.json"),
  SESSIONS_PATH: path.resolve(process.env.SESSIONS_PATH || "./sessions"),
  DEFAULT_COUNTRY: process.env.DEFAULT_COUNTRY || "IT",
  DEFAULT_MIN_DELAY_SECONDS: Number(process.env.DEFAULT_MIN_DELAY_SECONDS || 10),
  DEFAULT_MAX_DELAY_SECONDS: Number(process.env.DEFAULT_MAX_DELAY_SECONDS || 60),
  DEFAULT_MAX_MESSAGES_PER_DAY: Number(process.env.DEFAULT_MAX_MESSAGES_PER_DAY || 150),
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || null,
  TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID || null,
  LOG_LEVEL: process.env.LOG_LEVEL || "info",
};
