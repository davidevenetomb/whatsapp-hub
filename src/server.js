import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { config } from "./config.js";
import { logger } from "./utils/logger.js";
import { registro } from "./whatsapp/Registro.js";
import { avviaWorker } from "./coda/worker.js";
import { adminRouter } from "./routes/admin.js";
import { qrRouter } from "./routes/qr.js";
import { webhookRouter } from "./routes/webhook.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const app = express();
  app.use(express.json());

  app.get("/health", (_req, res) => res.json({ ok: true }));
  app.use("/api", adminRouter);
  app.use("/p", qrRouter);
  app.use("/webhook", webhookRouter);
  app.use("/admin", express.static(path.join(__dirname, "..", "public", "admin")));

  app.use((err, _req, res, _next) => {
    logger.error({ err: err.message, stack: err.stack }, "Errore non gestito");
    res.status(500).json({ error: "errore interno" });
  });

  // Riapre le sessioni WhatsApp già collegate prima di accettare traffico,
  // così un riavvio del processo non lascia clienti scollegati in silenzio.
  await registro.avvia();
  avviaWorker();

  app.listen(config.PORT, () => {
    logger.info({ porta: config.PORT }, "WhatsApp Hub avviato");
  });
}

main().catch((err) => {
  logger.error({ err: err.message, stack: err.stack }, "Avvio fallito");
  process.exit(1);
});
