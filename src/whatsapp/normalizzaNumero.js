import { parsePhoneNumberFromString } from "libphonenumber-js";
import { config } from "../config.js";

// Restituisce il numero in E.164 (es. +393331234567) o null se non valido.
export function normalizzaNumero(raw, defaultCountry = config.DEFAULT_COUNTRY) {
  if (!raw || typeof raw !== "string") return null;
  const parsed = parsePhoneNumberFromString(raw, defaultCountry);
  if (!parsed || !parsed.isValid()) return null;
  return parsed.number;
}

// Converte un E.164 nel formato JID richiesto da Baileys (numero@s.whatsapp.net).
export function numeroToJid(e164) {
  return `${e164.replace("+", "")}@s.whatsapp.net`;
}
