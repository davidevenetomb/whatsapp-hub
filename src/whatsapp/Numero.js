import fs from "node:fs";
import path from "node:path";
import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} from "@whiskeysockets/baileys";
import { config } from "../config.js";
import { logger } from "../utils/logger.js";
import { numeroToJid } from "./normalizzaNumero.js";

const RICONNESSIONE_BASE_MS = 3000;
const RICONNESSIONE_MAX_MS = 60000;

// Una connessione Baileys indipendente per un singolo cliente. Lo stato qui dentro
// corrisponde uno a uno ai badge del pannello admin: da_collegare, in_attesa, attivo,
// offline, scollegato. Riconnette da sola sui cali di rete, non dopo un logout esplicito,
// perché lì il cliente deve per forza riscansionare.
export class Numero {
  constructor(clienteId, { onStatoCambiato, onQrAggiornato } = {}) {
    this.clienteId = clienteId;
    this.sessionDir = path.join(config.SESSIONS_PATH, clienteId);
    this.onStatoCambiato = onStatoCambiato || (() => {});
    this.onQrAggiornato = onQrAggiornato || (() => {});
    this.sock = null;
    this.stato = "da_collegare";
    this.qrCorrente = null;
    this.numeroCollegato = null;
    this.tentativiRiconnessione = 0;
    this._avviato = false;
    this._fermatoManualmente = false;
  }

  getStato() {
    return this.stato;
  }

  getQr() {
    return this.qrCorrente;
  }

  _setStato(nuovoStato) {
    if (this.stato === nuovoStato) return;
    this.stato = nuovoStato;
    this.onStatoCambiato(this.clienteId, nuovoStato);
  }

  // Cancella le credenziali su disco e resetta lo stato, così il prossimo start()
  // genera per forza un QR nuovo invece di provare a riprendere una sessione morta.
  async resettaSessione() {
    await this.stop();
    fs.rmSync(this.sessionDir, { recursive: true, force: true });
    this.qrCorrente = null;
    this.numeroCollegato = null;
    this.tentativiRiconnessione = 0;
    this._setStato("da_collegare");
  }

  async start() {
    if (this._avviato) return;
    this._avviato = true;
    this._fermatoManualmente = false;
    fs.mkdirSync(this.sessionDir, { recursive: true });

    const { state, saveCreds } = await useMultiFileAuthState(this.sessionDir);
    const { version } = await fetchLatestBaileysVersion();

    const baileysLogger = logger.child({ modulo: "baileys", cliente: this.clienteId });
    baileysLogger.level = "warn";

    this.sock = makeWASocket({
      version,
      auth: state,
      logger: baileysLogger,
    });

    this.sock.ev.on("creds.update", saveCreds);
    this.sock.ev.on("connection.update", (update) => this._onConnectionUpdate(update));
  }

  _onConnectionUpdate(update) {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      this.qrCorrente = qr;
      if (this.stato !== "attivo") this._setStato("in_attesa");
      this.onQrAggiornato(this.clienteId, qr);
    }

    if (connection === "open") {
      this.qrCorrente = null;
      this.tentativiRiconnessione = 0;
      const jid = this.sock?.user?.id;
      if (jid) this.numeroCollegato = `+${jid.split(":")[0].split("@")[0]}`;
      this._setStato("attivo");
    }

    if (connection === "close") {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const loggedOut = statusCode === DisconnectReason.loggedOut;

      if (loggedOut || this._fermatoManualmente) {
        this._avviato = false;
        this._setStato("scollegato");
        return;
      }

      this._avviato = false;
      this._setStato("offline");
      this._riconnetti();
    }
  }

  _riconnetti() {
    const attesa = Math.min(RICONNESSIONE_BASE_MS * 2 ** this.tentativiRiconnessione, RICONNESSIONE_MAX_MS);
    this.tentativiRiconnessione += 1;
    setTimeout(() => {
      if (this._fermatoManualmente) return;
      this.start().catch((err) =>
        logger.error({ err: err.message, cliente: this.clienteId }, "Riconnessione fallita"),
      );
    }, attesa);
  }

  // Chiude il socket senza cancellare le credenziali: la sessione resta valida
  // e un successivo start() la riprende senza bisogno di riscansionare.
  async stop() {
    this._fermatoManualmente = true;
    this._avviato = false;
    if (this.sock) {
      try {
        this.sock.end(undefined);
      } catch {
        // socket già chiuso, ignorabile
      }
      this.sock = null;
    }
  }

  // Termina la sessione WhatsApp lato cliente (equivalente a "Rimuovi dispositivo").
  async logout() {
    this._fermatoManualmente = true;
    if (this.sock) {
      try {
        await this.sock.logout();
      } catch {
        // se il socket è già caduto il logout può fallire, non è bloccante
      }
      this.sock = null;
    }
    this._avviato = false;
    this._setStato("scollegato");
  }

  async sendText(numeroE164, testo) {
    if (this.stato !== "attivo" || !this.sock) {
      throw new Error("Numero non connesso");
    }
    await this.sock.sendMessage(numeroToJid(numeroE164), { text: testo });
  }
}
