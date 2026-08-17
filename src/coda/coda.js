import { store } from "../store.js";

export function trovaPerExternalId(clienteId, externalId) {
  if (!externalId) return null;
  return store.state.coda.find((m) => m.clienteId === clienteId && m.externalId === externalId);
}

function prossimoId() {
  return store.state.coda.reduce((max, m) => Math.max(max, m.id), 0) + 1;
}

function ritardoCasuale(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export async function accoda({ clienteId, destinatario, testo, externalId, ritardoMin, ritardoMax }) {
  const secondi = ritardoCasuale(ritardoMin, ritardoMax);
  const messaggio = {
    id: prossimoId(),
    clienteId,
    destinatario,
    testo,
    externalId: externalId || null,
    stato: "pending",
    tentativi: 0,
    programmatoPer: new Date(Date.now() + secondi * 1000).toISOString(),
    errore: null,
  };
  store.state.coda.push(messaggio);
  await store.save();
  return messaggio;
}
