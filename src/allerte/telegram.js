import { config } from "../config.js";
import { store } from "../store.js";
import { logger } from "../utils/logger.js";

const RIPETIZIONE_MIN_MS = 60 * 60 * 1000; // stessa allerta per lo stesso cliente non prima di 1 ora

async function inviaTelegram(testo) {
  if (!config.TELEGRAM_BOT_TOKEN || !config.TELEGRAM_CHAT_ID) {
    logger.info({ testo }, "[allerta] Telegram non configurato, solo log");
    return;
  }
  const url = `https://api.telegram.org/bot${config.TELEGRAM_BOT_TOKEN}/sendMessage`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: config.TELEGRAM_CHAT_ID, text: testo }),
    });
    if (!res.ok) {
      logger.warn({ status: res.status }, "Invio allerta Telegram fallito");
    }
  } catch (err) {
    logger.warn({ err: err.message }, "Errore di rete inviando allerta Telegram");
  }
}

// chiave dedup: es. "idraulica-rossi:scollegato". Evita di riscrivere la stessa allerta
// per lo stesso cliente più di una volta all'ora, per non svalutare la notifica.
function giaInviataDiRecente(chiave) {
  const ultimaVolta = store.state.allerteInviate[chiave];
  if (!ultimaVolta) return false;
  return Date.now() - new Date(ultimaVolta).getTime() < RIPETIZIONE_MIN_MS;
}

function segnaInviata(chiave) {
  store.state.allerteInviate[chiave] = new Date().toISOString();
  store.save();
}

export async function allerta(chiave, testo) {
  if (giaInviataDiRecente(chiave)) return;
  segnaInviata(chiave);
  await inviaTelegram(testo);
}

export async function allertaClienteScollegato(nome) {
  await allerta(`${nome}:scollegato`, `SCOLLEGATO, ${nome}: il numero è stato scollegato. Serve un nuovo QR.`);
}

export async function allertaClienteOffline(nome) {
  await allerta(`${nome}:offline`, `OFFLINE, ${nome}: il numero è offline da più di 15 minuti.`);
}

export async function allertaClienteTornatoAttivo(nome) {
  await allerta(`${nome}:attivo`, `ATTIVO, ${nome}: il numero è tornato attivo.`);
}

export async function allertaInvioFallito(nome, destinatario, motivo) {
  await allerta(
    `${nome}:invio-fallito:${destinatario}`,
    `INVIO FALLITO, ${nome}: invio a ${destinatario} fallito definitivamente. Motivo: ${motivo}`,
  );
}

export async function allertaTettoRaggiunto(nome) {
  await allerta(`${nome}:tetto`, `TETTO RAGGIUNTO, ${nome}: raggiunto il tetto giornaliero di messaggi. Invii in pausa fino a domani.`);
}
