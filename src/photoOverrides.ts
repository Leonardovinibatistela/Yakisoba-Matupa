import { deleteField, doc, onSnapshot, setDoc } from "firebase/firestore";
import { db } from "./firebase";

// Mesma ideia do priceOverrides.ts: um único documento guarda a foto nova
// de cada item que o admin trocou pelo painel, num mapa { idDoItem: url }.
// Item sem entrada aqui continua usando a foto padrão que já vem no código.
const photoOverridesRef = doc(db, "menuStatus", "photoOverrides");

export function subscribePhotoOverrides(onUpdate: (images: Record<string, string>) => void, onError?: (error: unknown) => void): () => void {
  return onSnapshot(
    photoOverridesRef,
    (snap) => onUpdate(snap.exists() ? ((snap.data().images as Record<string, string>) ?? {}) : {}),
    onError
  );
}

/** Define uma foto nova pra um item. Só o admin autenticado pode chamar isso. */
export async function setItemPhoto(itemId: string, url: string): Promise<void> {
  await setDoc(photoOverridesRef, { [`images.${itemId}`]: url }, { merge: true });
}

/** Volta o item pra foto padrão do cardápio (remove o ajuste manual). */
export async function clearItemPhoto(itemId: string): Promise<void> {
  await setDoc(photoOverridesRef, { [`images.${itemId}`]: deleteField() }, { merge: true });
}
