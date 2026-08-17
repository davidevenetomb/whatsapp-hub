import fs from "node:fs";
import path from "node:path";
import { config } from "../config.js";
import { store } from "../store.js";
import { slugFromName, uniqueId, newApiKey, newToken } from "../ids.js";
import { Numero } from "./Numero.js";
import {
  allertaClienteScollegato,
  allertaClienteOffline,
  allertaClienteTornatoAttivo,
} from "../allerte/telegram.js";

const QR_VALIDITA_MS = 24 * 60 * 60 * 1000;
const OFFLINE_ALLERTA_DOPO_MS = 15 * 60 * 1000;

// Registry singleton: possiede tutte le connessioni WhatsApp (una per cliente),
// tiene lo store allineato con i cambi di stato, e fa scattare le allerte.
class Registro {
  constructor() {
    this.numeri = new Map();
    this._offlineTimers = new Map();
  }

  async avvia() {
    fs.mkdirSync(config.SESSIONS_PATH, { recursive: true });
    for (const cliente of store.state.clienti) {
      const dir = path.join(config.SESSIONS_PATH, cliente.id);
      const haCredenziali = fs.existsSync(dir) && fs.readdirSync(dir).length > 0;
      if (haCredenziali) {
        const numero = this._istanzia(cliente.id);
        await numero.start();
      }
    }
  }

  _istanzia(clienteId) {
    if (this.numeri.has(clienteId)) return this.numeri.get(clienteId);
    const numero = new Numero(clienteId, {
      onStatoCambiato: (id, stato) => this._onStatoCambiato(id, stato),
    });
    this.numeri.set(clienteId, numero);
    return numero;
  }

  _trovaCliente(clienteId) {
    return store.state.clienti.find((c) => c.id === clienteId);
  }

  async _onStatoCambiato(clienteId, stato) {
    const cliente = this._trovaCliente(clienteId);
    if (!cliente) return;

    const statoPrecedente = cliente.stato;
    cliente.stato = stato;
    cliente.ultimaAttivita = new Date().toISOString();

    const numero = this.numeri.get(clienteId);
    if (stato === "attivo" && numero?.numeroCollegato) {
      cliente.numero = numero.numeroCollegato;
    }

    if (stato === "offline") {
      cliente.offlineDa = cliente.offlineDa || new Date().toISOString();
      this._armaAllertaOffline(clienteId, cliente.nome);
    } else {
      this._disarmaAllertaOffline(clienteId);
    }

    if (stato === "attivo") {
      cliente.offlineDa = null;
    }

    await store.save();

    // Le allerte partono dopo aver salvato, così lo stato del pannello è già coerente
    // anche se l'invio a Telegram fallisce o è lento.
    if (stato === "scollegato") {
      await allertaClienteScollegato(cliente.nome);
    }
    if (stato === "attivo" && (statoPrecedente === "offline" || statoPrecedente === "scollegato")) {
      await allertaClienteTornatoAttivo(cliente.nome);
    }
  }

  _armaAllertaOffline(clienteId, nome) {
    if (this._offlineTimers.has(clienteId)) return;
    const timer = setTimeout(() => {
      this._offlineTimers.delete(clienteId);
      const numero = this.numeri.get(clienteId);
      if (numero?.getStato() === "offline") {
        allertaClienteOffline(nome);
      }
    }, OFFLINE_ALLERTA_DOPO_MS);
    this._offlineTimers.set(clienteId, timer);
  }

  _disarmaAllertaOffline(clienteId) {
    const timer = this._offlineTimers.get(clienteId);
    if (timer) {
      clearTimeout(timer);
      this._offlineTimers.delete(clienteId);
    }
  }

  async crea({ nome }) {
    const esistenti = new Set(store.state.clienti.map((c) => c.id));
    const id = uniqueId(slugFromName(nome), esistenti);
    const cliente = {
      id,
      nome,
      key: newApiKey(),
      numero: null,
      stato: "da_collegare",
      qrToken: null,
      qrScadeIl: null,
      offlineDa: null,
      ultimaAttivita: null,
      limiti: {
        ritardoMin: config.DEFAULT_MIN_DELAY_SECONDS,
        ritardoMax: config.DEFAULT_MAX_DELAY_SECONDS,
        tettoGiornaliero: config.DEFAULT_MAX_MESSAGES_PER_DAY,
      },
      creatoIl: new Date().toISOString(),
    };
    store.state.clienti.push(cliente);
    await store.save();
    return cliente;
  }

  async rimuovi(clienteId) {
    const numero = this.numeri.get(clienteId);
    if (numero) {
      await numero.logout().catch(() => {});
      this.numeri.delete(clienteId);
    }
    this._disarmaAllertaOffline(clienteId);
    fs.rmSync(path.join(config.SESSIONS_PATH, clienteId), { recursive: true, force: true });
    store.state.clienti = store.state.clienti.filter((c) => c.id !== clienteId);
    store.state.coda = store.state.coda.filter((m) => m.clienteId !== clienteId);
    delete store.state.contatori[clienteId];
    await store.save();
  }

  async rigeneraKey(clienteId) {
    const cliente = this._trovaCliente(clienteId);
    if (!cliente) throw new Error("Cliente non trovato");
    cliente.key = newApiKey();
    await store.save();
    return cliente.key;
  }

  // Genera (o rigenera) il link pubblico di pairing e assicura che il socket
  // Baileys sia vivo così da produrre un QR fresco.
  async generaLinkQr(clienteId) {
    const cliente = this._trovaCliente(clienteId);
    if (!cliente) throw new Error("Cliente non trovato");

    const numero = this._istanzia(clienteId);

    // Da scollegato o mai collegato, riprendere una sessione morta non produce
    // un QR: si riparte da credenziali pulite.
    if (cliente.stato === "scollegato" || cliente.stato === "da_collegare") {
      await numero.resettaSessione();
    }

    cliente.qrToken = newToken();
    cliente.qrScadeIl = new Date(Date.now() + QR_VALIDITA_MS).toISOString();
    if (cliente.stato === "da_collegare") cliente.stato = "in_attesa";
    await store.save();

    await numero.start();

    return `${config.PUBLIC_BASE_URL}/p/${cliente.qrToken}`;
  }

  trovaPerToken(qrToken) {
    return store.state.clienti.find((c) => c.qrToken === qrToken && new Date(c.qrScadeIl) > new Date());
  }

  risolviPerKey(apiKey) {
    return store.state.clienti.find((c) => c.key === apiKey);
  }

  getNumero(clienteId) {
    return this.numeri.get(clienteId);
  }

  lista() {
    return store.state.clienti.map((c) => ({
      id: c.id,
      nome: c.nome,
      stato: c.stato,
      numero: c.numero,
      key: c.key,
      ultimaAttivita: c.ultimaAttivita,
      limiti: c.limiti,
    }));
  }
}

export const registro = new Registro();
