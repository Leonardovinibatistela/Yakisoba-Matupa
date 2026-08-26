// Dados do cardápio — separado do App.tsx pra poder ser usado também pelo
// painel admin (ex.: marcar item como esgotado) sem duplicar essa lista.

export type MenuItem = { id: string; name: string; description?: string; price: number; priceLabel: string; image?: string };
export type MenuSection = { id: string; eyebrow: string; title: string; subtitle?: string; items: MenuItem[] };

export const menuSections: MenuSection[] = [
  { id: "combinados", eyebrow: "Combinados", title: "Combinados", items: [
    { id: "combo-48", name: "Combinado 48 peças", description: "6 hot roll, 30 sushis sortidos, 4 jou, 8 sashimis", price: 185, priceLabel: "$185", image: "cardapio/combo-48.jpg" },
    { id: "combo-32", name: "Combinado 32 peças", description: "8 hot roll, 20 sushis sortidos, 4 sashimis", price: 145, priceLabel: "$145", image: "cardapio/combo-32.jpg" },
    { id: "combo-28", name: "Combinado 28 peças", description: "8 hot roll, 20 sushis sortidos", price: 89, priceLabel: "$89", image: "cardapio/combo-28.jpg" },
    { id: "combo-57", name: "Combinado especial 57 peças", description: "8 hot roll, 33 sushis sortidos, 4 jou, 4 uniguiri, 8 sashimi", price: 280, priceLabel: "$280", image: "cardapio/combo-57.png" },
  ] },
  { id: "porcoes", eyebrow: "Porções individuais", title: "Porções individuais", items: [
    { id: "hot-roll", name: "Hot Roll Filadélfia (8 unidades)", price: 32.9, priceLabel: "$32,90", image: "cardapio/hot-roll.jpg" },
    { id: "hossomaki", name: "Hossomaki (8 unidades)", price: 30.9, priceLabel: "$30,90", image: "cardapio/hossomaki.jpg" },
    { id: "uramaki-fila", name: "Uramaki Filadélfia (8 unidades)", price: 35.9, priceLabel: "$35,90", image: "cardapio/uramaki-fila.jpg" },
    { id: "uramaki-grelhado", name: "Uramaki Grelhado (8 unidades)", price: 35.9, priceLabel: "$35,90", image: "cardapio/uramaki-grelhado.jpg" },
    { id: "uramaki-skin", name: "Uramaki Skin (8 unidades)", price: 32.9, priceLabel: "$32,90", image: "cardapio/uramaki-skin.jpg" },
    { id: "sashimi-salmao", name: "Sashimi Salmão (5 unidades)", price: 45.9, priceLabel: "$45,90", image: "cardapio/sashimi-salmao.jpg" },
    { id: "sushi-dog", name: "Sushi Dog (120g de salmão cru)", price: 52.9, priceLabel: "$52,90", image: "cardapio/sushi-dog.jpg" },
    { id: "sushi-dog-grelhado", name: "Sushi Dog Salmão Grelhado (120g de salmão grelhado)", price: 52.9, priceLabel: "$52,90", image: "cardapio/sushi-dog-grelhado.jpg" },
  ] },
  { id: "yaki-medio", eyebrow: "Yakisoba Médio (500g)", title: "Seu yakisoba, do seu jeito", items: [
    { id: "medio-porco", name: "Porco 500g", price: 36.9, priceLabel: "R$36,90", image: "cardapio/yaki-porco.jpg" },
    { id: "medio-frango", name: "Frango 500g", price: 33.9, priceLabel: "R$33,90", image: "cardapio/yaki-frango.jpg" },
    { id: "medio-misto", name: "Misto 500g", price: 35.9, priceLabel: "R$35,90", image: "cardapio/yaki-carne.jpg" },
    { id: "medio-carne", name: "Carne 500g", price: 38.9, priceLabel: "R$38,90", image: "cardapio/yaki-carne.jpg" },
  ] },
  { id: "yaki-grande", eyebrow: "Yakisoba Grande (750g)", title: "Mais sabor para compartilhar", items: [
    { id: "grande-carne", name: "Carne 750g", price: 49.9, priceLabel: "R$49,90", image: "cardapio/yaki-carne.jpg" },
    { id: "grande-porco", name: "Porco 750g", price: 45.9, priceLabel: "R$45,90", image: "cardapio/yaki-porco.jpg" },
    { id: "grande-frango", name: "Frango 750g", price: 41.9, priceLabel: "R$41,90", image: "cardapio/yaki-frango.jpg" },
    { id: "grande-misto", name: "Misto 750g", price: 47.9, priceLabel: "R$47,90", image: "cardapio/yaki-carne.jpg" },
  ] },
  { id: "yaki-proteico", eyebrow: "Yaki Proteico (sem macarrão)", title: "Yaki Proteico", subtitle: "G com 200g de proteína, M com 150g de proteína", items: [
    { id: "proteico-frango-g", name: "Frango (G)", price: 33.9, priceLabel: "R$33,90", image: "cardapio/proteico-frango.jpg" },
    { id: "proteico-frango-m", name: "Frango (M)", price: 23.9, priceLabel: "R$23,90", image: "cardapio/proteico-frango.jpg" },
    { id: "proteico-carne-g", name: "Carne (G)", price: 47.9, priceLabel: "R$47,90", image: "cardapio/proteico-carne.jpg" },
    { id: "proteico-carne-m", name: "Carne (M)", price: 35.9, priceLabel: "R$35,90", image: "cardapio/proteico-carne.jpg" },
    { id: "proteico-misto-g", name: "Misto (G)", price: 37.9, priceLabel: "R$37,90", image: "cardapio/proteico-misto.jpg" },
    { id: "proteico-misto-m", name: "Misto (M)", price: 27.9, priceLabel: "R$27,90", image: "cardapio/proteico-misto.jpg" },
  ] },
  { id: "bebidas", eyebrow: "Bebidas", title: "Pra acompanhar", items: [
    { id: "coca-lata", name: "Coca-Cola lata", price: 5, priceLabel: "R$5,00", image: "cardapio/coca-lata.jpg" },
    { id: "agua-com-gas", name: "Água com gás", price: 5, priceLabel: "R$5,00", image: "cardapio/agua-com-gas.jpg" },
    { id: "coca-1-5", name: "Coca-Cola 1,5L", price: 12, priceLabel: "R$12,00", image: "cardapio/coca-1-5.jpg" },
  ] },
];

export const addonSections: MenuSection[] = [
  { id: "legumes", eyebrow: "Adicionais de legumes", title: "Mais cor, mais crocância", items: [
    { id: "brocolis", name: "Brócolis", price: 3, priceLabel: "R$3,00" }, { id: "couve-flor", name: "Couve flor", price: 3, priceLabel: "R$3,00" }, { id: "repolho", name: "Repolho", price: 3, priceLabel: "R$3,00" }, { id: "repolho-roxo", name: "Repolho roxo", price: 3, priceLabel: "R$3,00" }, { id: "pimentao-vermelho", name: "Pimentão vermelho", price: 3, priceLabel: "R$3,00" }, { id: "pimentao-amarelo", name: "Pimentão amarelo", price: 3, priceLabel: "R$3,00" }, { id: "cebola", name: "Cebola", price: 3, priceLabel: "R$3,00" }, { id: "cenoura", name: "Cenoura", price: 3, priceLabel: "R$3,00" }, { id: "todos-legumes", name: "Todos", price: 10, priceLabel: "R$10,00" },
  ] },
  { id: "carnes", eyebrow: "Adicionais de carnes", title: "Complete seu pedido", items: [
    { id: "frango-extra", name: "Carne de frango", price: 4, priceLabel: "R$4,00" }, { id: "bovina-extra", name: "Carne bovina", price: 5, priceLabel: "R$5,00" },
  ] },
];

export type ComboOffer = MenuItem & { days: number[]; daysLabel: string };
export const comboOffers: ComboOffer[] = [
  { id: "combo-individual", name: "Combo Individual", price: 65.9, priceLabel: "R$65,90", description: "1 Yakisoba Médio, 1 porção de Hot Roll, 1 Coca-Cola lata", days: [1], daysLabel: "Segunda-feira", image: "cardapio/combo-individual.jpg" },
  { id: "combo-filadelfia", name: "Combo Filadélfia", price: 67.9, priceLabel: "R$67,90", description: "1 Uramaki Filadélfia, 1 Hot Roll Filadélfia, 1 Coca-Cola lata", days: [2, 3], daysLabel: "Terça e Quarta-feira", image: "cardapio/combo-filadelfia.jpg" },
  { id: "combo-duplo", name: "Combo Duplo", price: 74.9, priceLabel: "R$74,90", description: "2 Yakisobas Médios + 1 Coca-Cola 1,5L", days: [3, 4], daysLabel: "Quarta e Quinta", image: "cardapio/combo-duplo.jpg" },
  { id: "combo-familia", name: "Combo Família", price: 114.9, priceLabel: "R$114,90", description: "1 Yakisoba Grande + 1 Yakisoba Médio + 1 Porção de Hot Roll + 1 Coca-Cola 1,5L", days: [5, 6, 0], daysLabel: "Sexta, Sábado e Domingo", image: "cardapio/combo-familia.jpg" },
];
