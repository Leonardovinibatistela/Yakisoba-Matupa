// Acompanha se ESTE painel está realmente falando com o servidor (ver siteDiagnostics.ts).
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";
import type { ConnectionState } from "./siteDiagnostics";

/**
 * fromCache = true quer dizer "só estou mostrando o que eu já tinha na memória" (sem conexão com o servidor);
 * hasPendingWrites = true quer dizer "tem ordem minha esperando o servidor confirmar".
 */
export function subscribeConnection(onUpdate: (state: ConnectionState) => void): () => void {
  return onSnapshot(
    doc(db, "menuStatus", "manualClose"),
    { includeMetadataChanges: true },
    (snap) => onUpdate({ fromCache: snap.metadata.fromCache, hasPendingWrites: snap.metadata.hasPendingWrites, at: Date.now() }),
    () => onUpdate({ fromCache: true, hasPendingWrites: false, at: Date.now() }),
  );
}
