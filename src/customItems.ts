import { addDoc, collection, deleteDoc, doc, onSnapshot, orderBy, query, serverTimestamp } from "firebase/firestore";
import { db } from "./firebase";

// Itens que o próprio cliente (dono do Sooba) adiciona pelo painel admin —
// um sabor novo de yakisoba, um combinado novo, etc. — sem precisar pedir
// pra mexer no código. Ficam guardados à parte do cardápio "de fábrica"
// (menuData.ts) e são somados na hora de mostrar cada seção do cardápio.
export type CustomMenuItem = {
  id: string;
  sectionId: string;
  name: string;
  description?: string;
  price: number;
  priceLabel: string;
  image?: string;
};

const formatPrice = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const customItemsCollectionRef = collection(db, "customMenuItems");

export function subscribeCustomItems(onUpdate: (items: CustomMenuItem[]) => void, onError?: (error: unknown) => void): () => void {
  return onSnapshot(
    query(customItemsCollectionRef, orderBy("createdAt", "asc")),
    (snapshot) => onUpdate(snapshot.docs.map((docSnap) => {
      const data = docSnap.data();
      const price = Number(data.price) || 0;
      return {
        id: docSnap.id,
        sectionId: data.sectionId as string,
        name: data.name as string,
        description: (data.description as string | undefined) || undefined,
        price,
        priceLabel: formatPrice(price),
        image: (data.image as string | undefined) || undefined,
      };
    })),
    onError
  );
}

export async function addCustomItem(input: { sectionId: string; name: string; description?: string; price: number; image?: string }): Promise<void> {
  await addDoc(customItemsCollectionRef, {
    sectionId: input.sectionId,
    name: input.name,
    description: input.description ?? "",
    price: input.price,
    image: input.image ?? "",
    createdAt: serverTimestamp(),
  });
}

export async function removeCustomItem(id: string): Promise<void> {
  await deleteDoc(doc(db, "customMenuItems", id));
}
