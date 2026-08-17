import { Router } from "express";
import { z } from "zod";
import { registro } from "../whatsapp/Registro.js";
import { normalizzaNumero } from "../whatsapp/normalizzaNumero.js";
import { accoda, trovaPerExternalId } from "../coda/coda.js";
import { logger } from "../utils/logger.js";

export const webhookRouter = Router();

const payloadSchema = z.object({
  to: z.string().min(1),
  message: z.string().min(1),
  externalId: z.string().optional(),
});

function estraiKey(req) {
  const header = req.header("X-Api-Key");
  if (header) return header;
  if (typeof req.body?.key === "string") return req.body.key;
  return null;
}

// La key nell'header identifica da quale numero deve partire il messaggio.
// Risponde subito con 202: Make va in timeout e ritenta, l'invio vero avviene
// più tardi nella coda con ritardo randomizzato.
webhookRouter.post("/send", async (req, res) => {
  const apiKey = estraiKey(req);
  const cliente = apiKey ? registro.risolviPerKey(apiKey) : null;
  if (!cliente) {
    res.status(401).json({ error: "non autorizzato" });
    return;
  }

  const parsed = payloadSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "payload non valido", dettagli: parsed.error.flatten() });
    return;
  }

  const destinatario = normalizzaNumero(parsed.data.to);
  if (!destinatario) {
    res.status(400).json({ error: "numero destinatario non valido" });
    return;
  }

  const { message: testo, externalId } = parsed.data;

  if (externalId) {
    const esistente = trovaPerExternalId(cliente.id, externalId);
    if (esistente) {
      res.status(200).json({ stato: "duplicato_ignorato", messaggioId: esistente.id });
      return;
    }
  }

  const messaggio = await accoda({
    clienteId: cliente.id,
    destinatario,
    testo,
    externalId,
    ritardoMin: cliente.limiti.ritardoMin,
    ritardoMax: cliente.limiti.ritardoMax,
  });

  logger.info({ cliente: cliente.id, messaggioId: messaggio.id }, "Messaggio accodato da webhook");
  res.status(202).json({ stato: "in_coda", messaggioId: messaggio.id, programmatoPer: messaggio.programmatoPer });
});
