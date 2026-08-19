import { addDoc, collection, deleteDoc, doc, getDocs, orderBy, query, serverTimestamp, Timestamp } from "firebase/firestore";
import { db } from "./firebase";

export type CarouselImage = { id: string; url: string; publicId: string; createdAt: Date };

export const CAROUSEL_MAX_IMAGES = 2;

const carouselCollectionRef = collection(db, "carouselImages");

export async function fetchCarouselImages(): Promise<CarouselImage[]> {
  const snapshot = await getDocs(query(carouselCollectionRef, orderBy("createdAt", "asc")));
  return snapshot.docs.map((docSnap) => {
    const data = docSnap.data();
    const createdAt = data.createdAt instanceof Timestamp ? data.createdAt.toDate() : new Date();
    return { id: docSnap.id, url: data.url as string, publicId: data.publicId as string, createdAt };
  });
}

/** Adiciona uma foto nova à lista. Quem chama já deve ter conferido o limite de CAROUSEL_MAX_IMAGES antes. */
export async function addCarouselImage(url: string, publicId: string): Promise<void> {
  await addDoc(carouselCollectionRef, { url, publicId, createdAt: serverTimestamp() });
}

/** Remove a referência da foto do site. O arquivo em si continua guardado no Cloudinary (ver explicação no chat). */
export async function removeCarouselImage(id: string): Promise<void> {
  await deleteDoc(doc(db, "carouselImages", id));
}
