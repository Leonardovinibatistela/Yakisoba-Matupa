import { addDoc, collection, deleteDoc, doc, onSnapshot, orderBy, query, updateDoc } from "firebase/firestore";
import { db } from "../firebase";

export type FixedExpense = { id: string; name: string; amount: number };

const fixedExpensesCollection = collection(db, "fixedExpenses");

export function subscribeFixedExpenses(onUpdate: (expenses: FixedExpense[]) => void, onError?: (error: unknown) => void): () => void {
  return onSnapshot(
    query(fixedExpensesCollection, orderBy("name")),
    (snapshot) => onUpdate(snapshot.docs.map((docSnap) => ({ id: docSnap.id, name: docSnap.data().name ?? "", amount: docSnap.data().amount ?? 0 }))),
    onError
  );
}

export async function addFixedExpense(name: string, amount: number): Promise<void> {
  await addDoc(fixedExpensesCollection, { name, amount });
}

export async function updateFixedExpense(id: string, name: string, amount: number): Promise<void> {
  await updateDoc(doc(db, "fixedExpenses", id), { name, amount });
}

export async function deleteFixedExpense(id: string): Promise<void> {
  await deleteDoc(doc(db, "fixedExpenses", id));
}
