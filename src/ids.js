import crypto from "node:crypto";

// Segni diacritici combinanti (es. l'accento staccato dalla lettera dopo normalize("NFD")).
// Scritto come escape \uXXXX, non come caratteri letterali, per evitare problemi di encoding.
const COMBINING_DIACRITICS = new RegExp(
  `[${String.fromCharCode(0x0300)}-${String.fromCharCode(0x036f)}]`,
  "g",
);

export function slugFromName(name) {
  return (
    name
      .toLowerCase()
      .normalize("NFD")
      .replace(COMBINING_DIACRITICS, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "cliente"
  );
}

export function uniqueId(baseSlug, existingIds) {
  if (!existingIds.has(baseSlug)) return baseSlug;
  let n = 2;
  while (existingIds.has(`${baseSlug}-${n}`)) n += 1;
  return `${baseSlug}-${n}`;
}

export function newApiKey() {
  return `wak_${crypto.randomBytes(24).toString("hex")}`;
}

export function newToken() {
  return crypto.randomBytes(24).toString("hex");
}
