import { collection, doc, getDoc, getDocs } from "firebase/firestore";
import { db } from "../firebase";
import { buildBackup, serializeValue, type BackupDoc, type BackupFile } from "./backupFormat";
import { withTimeout } from "./stockFormat";

// Tudo que o sistema guarda no Firestore. Só leitura: o backup nunca escreve nem apaga nada.
export const BACKUP_COLLECTIONS = ["orders", "ingredients", "ingredientPurchases", "fixedExpenses", "fixedExpenseHistory", "stockMovements", "customMenuItems", "dailyCombos", "carouselImages", "menuStatus"] as const;
// Se a leitura da coleção menuStatus inteira for negada, cai pra esta lista (os documentos que o sistema usa).
const MENU_STATUS_DOCS = ["soldOut", "priceOverrides", "nameOverrides", "descriptionOverrides", "photoOverrides", "hiddenItems", "manualOpen", "emergencyPause", "recipes", "paymentFees", "orderCosts"];

const ONE_MINUTE = 60_000;

const toBackupDocs = (docs: { id: string; data: () => unknown }[]): BackupDoc[] => docs.map((snap) => ({ id: snap.id, data: serializeValue(snap.data()) as Record<string, unknown> }));

async function readCollection(name: string): Promise<BackupDoc[]> {
  const snap = await withTimeout(getDocs(collection(db, name)), ONE_MINUTE);
  return toBackupDocs(snap.docs);
}

async function readMenuStatus(): Promise<BackupDoc[]> {
  try {
    return await readCollection("menuStatus");
  } catch {
    const found: BackupDoc[] = [];
    for (const id of MENU_STATUS_DOCS) {
      const snap = await withTimeout(getDoc(doc(db, "menuStatus", id)), ONE_MINUTE);
      if (snap.exists()) found.push({ id: snap.id, data: serializeValue(snap.data()) as Record<string, unknown> });
    }
    return found;
  }
}

/** Lê tudo e monta o arquivo de backup. `onProgress` recebe o nome da coleção sendo lida. */
export async function fetchBackup(onProgress: (label: string) => void): Promise<BackupFile> {
  const collections: Record<string, BackupDoc[]> = {};
  for (const name of BACKUP_COLLECTIONS) {
    onProgress(name);
    collections[name] = name === "menuStatus" ? await readMenuStatus() : await readCollection(name);
  }
  onProgress("counters");
  const counter = await withTimeout(getDoc(doc(db, "counters", "orders")), ONE_MINUTE);
  collections.counters = counter.exists() ? [{ id: counter.id, data: serializeValue(counter.data()) as Record<string, unknown> }] : [];
  return buildBackup(db.app.options.projectId ?? "desconhecido", new Date(), collections);
}

/** Só os pedidos (pra virar planilha). */
export const fetchOrders = (): Promise<BackupDoc[]> => readCollection("orders");
