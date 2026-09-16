import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { db } from "../firebase";

export type RecipeIngredient = { ingredientId: string; quantity: number };
export type Recipes = Record<string, RecipeIngredient[]>;

// Um único documento guarda a ficha técnica de todos os pratos, num mapa
// { idDoItem: [{ingredientId, quantity}] }. Item sem entrada aqui ainda não
// teve a ficha técnica cadastrada.
const recipesRef = doc(db, "menuStatus", "recipes");

export function subscribeRecipes(onUpdate: (recipes: Recipes) => void, onError?: (error: unknown) => void): () => void {
  return onSnapshot(
    recipesRef,
    (snap) => onUpdate(snap.exists() ? ((snap.data().recipes as Recipes) ?? {}) : {}),
    onError
  );
}

/** Define (ou substitui) a ficha técnica de um prato. Só o admin autenticado pode chamar isso. */
export async function setRecipe(itemId: string, ingredients: RecipeIngredient[]): Promise<void> {
  // Objeto aninhado, não chave com ponto — mesmo motivo do nameOverrides.ts.
  await setDoc(recipesRef, { recipes: { [itemId]: ingredients } }, { merge: true });
}
