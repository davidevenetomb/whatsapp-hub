import { Router } from "express";
import { z } from "zod";
import { config } from "../config.js";
import { registro } from "../whatsapp/Registro.js";
import { normalizzaNumero } from "../whatsapp/normalizzaNumero.js";

export const adminRouter = Router();

function authAdmin(req, res, next) {
  const header = req.header("Authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token || token !== config.ADMIN_TOKEN) {
    res.status(401).json({ error: "non autorizzato" });
    return;
  }
  next();
}

adminRouter.use(authAdmin);

adminRouter.get("/clienti", (_req, res) => {
  res.json({ clienti: registro.lista() });
});

const creaClienteSchema = z.object({ nome: z.string().min(1).max(120) });

adminRouter.post("/clienti", async (req, res) => {
  const parsed = creaClienteSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "nome mancante o non valido" });
    return;
  }
  const cliente = await registro.crea(parsed.data);
  res.status(201).json({ cliente });
});

adminRouter.delete("/clienti/:id", async (req, res) => {
  await registro.rimuovi(req.params.id);
  res.json({ stato: "rimosso" });
});

adminRouter.post("/clienti/:id/link", async (req, res) => {
  try {
    const url = await registro.generaLinkQr(req.params.id);
    res.json({ url });
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

adminRouter.post("/clienti/:id/key", async (req, res) => {
  try {
    const key = await registro.rigeneraKey(req.params.id);
    res.json({ key });
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

const testSchema = z.object({ to: z.string().min(1), message: z.string().min(1) });

// Invio immediato che bypassa la coda: serve a te come check dopo il collegamento,
// il cliente non lo vede da nessuna parte.
adminRouter.post("/clienti/:id/test", async (req, res) => {
  const parsed = testSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "payload non valido" });
    return;
  }
  const numero = registro.getNumero(req.params.id);
  if (!numero) {
    res.status(404).json({ error: "cliente non connesso" });
    return;
  }
  const destinatario = normalizzaNumero(parsed.data.to);
  if (!destinatario) {
    res.status(400).json({ error: "numero destinatario non valido" });
    return;
  }
  try {
    await numero.sendText(destinatario, parsed.data.message);
    res.json({ stato: "inviato" });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});
