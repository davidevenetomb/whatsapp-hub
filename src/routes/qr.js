import { Router } from "express";
import QRCode from "qrcode";
import { registro } from "../whatsapp/Registro.js";

export const qrRouter = Router();

// L'unica pagina che il cliente vede. Funzionale, senza branding, con un solo scopo:
// fargli scansionare il QR sul telefono giusto senza dover chiamarti per chiedere.
qrRouter.get("/:token", (req, res) => {
  const cliente = registro.trovaPerToken(req.params.token);
  if (!cliente) {
    res.status(404).send(paginaNonValida());
    return;
  }
  res.send(paginaPairing(req.params.token));
});

qrRouter.get("/:token/qr.png", async (req, res) => {
  const cliente = registro.trovaPerToken(req.params.token);
  if (!cliente) {
    res.status(404).end();
    return;
  }
  const numero = registro.getNumero(cliente.id);
  const qr = numero?.getQr();
  if (!qr) {
    res.status(409).json({ error: "qr non ancora disponibile" });
    return;
  }
  res.set("Cache-Control", "no-store");
  const png = await QRCode.toBuffer(qr, { type: "png", width: 320, margin: 1 });
  res.type("image/png").send(png);
});

qrRouter.get("/:token/stato", (req, res) => {
  const cliente = registro.trovaPerToken(req.params.token);
  if (!cliente) {
    res.status(404).json({ stato: "non_valido" });
    return;
  }
  res.json({ stato: cliente.stato });
});

function stileBase() {
  return `<style>
  :root { color-scheme: light dark; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    margin: 0; padding: 32px 20px; display: flex; justify-content: center;
  }
  .box { max-width: 380px; width: 100%; text-align: center; }
  .avviso { font-weight: 600; font-size: 1.05rem; margin: 0 0 24px; line-height: 1.5; }
  .passi { text-align: left; margin: 0 0 24px; padding-left: 22px; line-height: 1.6; }
  #qrImg { width: 100%; max-width: 280px; border-radius: 10px; background: #fff; padding: 10px; }
  .conferma { color: #16a34a; font-weight: 600; font-size: 1.15rem; line-height: 1.5; }
  .hidden { display: none; }
</style>`;
}

function paginaNonValida() {
  return `<!doctype html>
<html lang="it">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Link non valido</title>
${stileBase()}
</head>
<body><div class="box"><p>Link non valido o scaduto.</p></div></body>
</html>`;
}

function paginaPairing(token) {
  return `<!doctype html>
<html lang="it">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Collega WhatsApp</title>
${stileBase()}
</head>
<body>
<div class="box">
  <p class="avviso">Apri questa pagina su un dispositivo diverso da quello che vuoi collegare, poi scansiona il codice qui sotto con il telefono che vuoi collegare.</p>
  <ol class="passi">
    <li>Sul telefono da collegare apri WhatsApp</li>
    <li>Vai su Impostazioni, poi Dispositivi collegati</li>
    <li>Tocca "Collega un dispositivo"</li>
    <li>Inquadra il codice qui sotto</li>
  </ol>
  <div id="qrWrap"><img id="qrImg" src="/p/${token}/qr.png" alt="Codice QR"></div>
  <div id="confermaWrap" class="hidden">
    <p class="conferma">Numero collegato correttamente. Puoi chiudere questa pagina.</p>
  </div>
</div>
<script>
  const token = ${JSON.stringify(token)};
  async function controllaStato() {
    try {
      const res = await fetch("/p/" + token + "/stato");
      const dati = await res.json();
      if (dati.stato === "attivo") {
        document.getElementById("qrWrap").classList.add("hidden");
        document.getElementById("confermaWrap").classList.remove("hidden");
        return;
      }
    } catch (e) {
      // rete non disponibile momentaneamente, si ritenta al giro successivo
    }
    document.getElementById("qrImg").src = "/p/" + token + "/qr.png?t=" + Date.now();
    setTimeout(controllaStato, 2000);
  }
  setTimeout(controllaStato, 2000);
</script>
</body>
</html>`;
}
