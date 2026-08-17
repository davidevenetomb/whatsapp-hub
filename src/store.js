import fs from "node:fs";
import path from "node:path";
import { config } from "./config.js";

function emptyState() {
  return { clienti: [], coda: [], contatori: {}, allerteInviate: {} };
}

class Store {
  constructor(filePath) {
    this.filePath = filePath;
    this.state = this._load();
    this._writeChain = Promise.resolve();
  }

  _load() {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    if (!fs.existsSync(this.filePath)) {
      const initial = emptyState();
      fs.writeFileSync(this.filePath, JSON.stringify(initial, null, 2));
      return initial;
    }
    const raw = fs.readFileSync(this.filePath, "utf8");
    return { ...emptyState(), ...JSON.parse(raw) };
  }

  // Scrittura atomica: file temporaneo poi rename, così un crash a metà scrittura
  // non lascia mai db.json corrotto o troncato.
  _persist() {
    this._writeChain = this._writeChain.then(() => {
      const tmpPath = `${this.filePath}.tmp`;
      fs.writeFileSync(tmpPath, JSON.stringify(this.state, null, 2));
      fs.renameSync(tmpPath, this.filePath);
    });
    return this._writeChain;
  }

  save() {
    return this._persist();
  }
}

export const store = new Store(config.DATA_PATH);
