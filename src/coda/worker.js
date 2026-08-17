import { store } from "../store.js";
import { registro } from "../whatsapp/Registro.js";
import { logger } from "../utils/logger.js";
import { allertaInvioFallito, allertaTettoRaggiunto } from "../allerte/telegram.js";

const INTERVALLO_MS = 5000;
const MAX_TENTATIVI = 3;

function oggiISO() {
  return new Date().toISOString().slice(0, 10);
}

function contatoreOggi(clienteId) {
  const c = store.state.contatori[clienteId];
  if (!c || c.data !== oggiISO()) return 0;
  return c.inviati;
}

function incrementaContatore(clienteId) {
  const oggi = oggiISO();
  const c = store.state.contatori[clienteId];
  if (!c || c.data !== oggi) {
    store.state.contatori[clienteId] = { data: oggi, inviati: 1 };
  } else {
    c.inviati += 1;
  }
}

// Il worker è l'unico punto da cui parte un invio automatico: i limiti per riga
// (tetto giornaliero, ritardo) vivono qui e non sono aggirabili dal webhook.
async function processaMessaggio(messaggio) {
  const cliente = store.state.clienti.find((c) => c.id === messaggio.clienteId);
  if (!cliente) {
    messaggio.stato = "failed";
    messaggio.errore = "cliente non trovato";
    return;
  }

  const numero = registro.getNumero(cliente.id);
  if (!numero || numero.getStato() !== "attivo") {
    // Cliente non connesso in questo momento: non è un fallimento, si ritenta al giro dopo.
    return;
  }

  const tetto = cliente.limiti?.tettoGiornaliero ?? Infinity;
  if (contatoreOggi(cliente.id) >= tetto) {
    messaggio.stato = "failed";
    messaggio.errore = "tetto giornaliero raggiunto";
    await allertaTettoRaggiunto(cliente.nome);
    return;
  }

  messaggio.tentativi += 1;
  try {
    await numero.sendText(messaggio.destinatario, messaggio.testo);
    messaggio.stato = "sent";
    incrementaContatore(cliente.id);
  } catch (err) {
    messaggio.errore = err.message;
    if (messaggio.tentativi >= MAX_TENTATIVI) {
      messaggio.stato = "failed";
      await allertaInvioFallito(cliente.nome, messaggio.destinatario, err.message);
    } else {
      const backoffSecondi = 30 * messaggio.tentativi;
      messaggio.programmatoPer = new Date(Date.now() + backoffSecondi * 1000).toISOString();
    }
  }
}

async function tick() {
  const ora = new Date();
  const daProcessare = store.state.coda.filter(
    (m) => m.stato === "pending" && new Date(m.programmatoPer) <= ora,
  );

  for (const messaggio of daProcessare) {
    await processaMessaggio(messaggio);
  }

  if (daProcessare.length > 0) {
    await store.save();
  }
}

export function avviaWorker() {
  setInterval(() => {
    tick().catch((err) => logger.error({ err: err.message }, "Errore nel worker della coda"));
  }, INTERVALLO_MS);
}
