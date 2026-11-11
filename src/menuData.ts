// Dados do cardápio — separado do App.tsx pra poder ser usado também pelo
// painel admin (ex.: marcar item como esgotado) sem duplicar essa lista.

// addedAt: data (AAAA-MM-DD) em que o item entrou no cardápio — usada só pra
// mostrar a etiqueta "Novo" por um tempo (ver NEW_ITEM_WINDOW_DAYS no
// App.tsx). Item sem addedAt nunca mostra a etiqueta. Sempre que acrescentar
// um item novo direto no código, preencher com a data de hoje.
// variantGroup: quando dois (ou mais) itens são a "mesma comida" com uma
// opção (ex.: cru vs. grelhado), colocar o mesmo texto nesse campo nos dois —
// eles aparecem juntos como uma única linha no cardápio, com botõezinhos pra
// escolher a opção, em vez de duas linhas separadas. variantLabel é o texto
// curto do botão (ex.: "Salmão cru"). O pedido/WhatsApp continua mostrando o
// nome completo certo da opção escolhida — só a exibição no cardápio muda.
export type MenuItem = { id: string; name: string; description?: string; price: number; priceLabel: string; image?: string; addedAt?: string; variantGroup?: string; variantLabel?: string };
export type MenuSection = { id: string; eyebrow: string; title: string; subtitle?: string; items: MenuItem[] };

// Seções novas (cardápio de sushi do Sooba): textos e preços como o dono mandou, na ordem que ele mandou. Ainda sem foto — quando
// chegarem, é só acrescentar `image: "cardapio/<arquivo>"` no item (ou o dono troca a foto em Cardápio > Editar, sem publicar).
const NEW = "2026-11-11";

export const menuSections: MenuSection[] = [
  { id: "entradas", eyebrow: "Entradas", title: "Entradas", items: [
    { id: "ceviche-salmao", name: "Ceviche de Salmão - 350g", description: "Cubos de salmão fresco marinados com cebola roxa, pimenta dedo-de-moça, cebolinha e manga, realçados com um toque cítrico que equilibra frescor e leve picância.", price: 65, priceLabel: "R$65,00", addedAt: NEW },
    { id: "sunomono", name: "Sunomono - 200g", description: "Fatias finas de pepino com molho agridoce.", price: 25, priceLabel: "R$25,00", addedAt: NEW },
  ] },
  { id: "combinados", eyebrow: "Combinados", title: "Combinados", items: [
    { id: "combo-28", name: "Combinado 28 peças", description: "8 hot roll, 20 sushis sortidos", price: 89, priceLabel: "$89", image: "cardapio/combo-28.jpg" },
    { id: "combo-especial-36", name: "Combinado Especial - 36 peças", description: "6 Sophia Especial, 6 Hot Nachos, 6 Fila Especial, 6 Ebiten, 6 Niguiri Brie, 6 Sashimi Salmão. Trocas serão somente por sushis que já estão no combinado.", price: 255, priceLabel: "R$255,00", addedAt: NEW },
  ] },
  { id: "usuzukuri", eyebrow: "Usuzukuri", title: "Usuzukuri", items: [
    { id: "usuzukuri-salmao", name: "Usuzukuri Salmão - 10 fatias", description: "Lâminas finas de salmão fresco, finalizado com azeite, cebolinha e molho do chef.", price: 35, priceLabel: "R$35,00", addedAt: NEW },
    { id: "usuzukuri-salmao-sooba", name: "Usuzukuri Salmão Sooba - 10 fatias", description: "Lâminas finas de salmão, finalizado com azeite trufado, raspas de limão siciliano e ovas.", price: 42.5, priceLabel: "R$42,50", addedAt: NEW },
    { id: "usuzukuri-tensei", name: "Usuzukuri Tensei - 10 fatias", description: "Lâminas finas de salmão, finalizado com azeite, tarê, crispe de alho poró.", price: 38, priceLabel: "R$38,00", addedAt: NEW },
  ] },
  { id: "sashimis", eyebrow: "Sashimis", title: "Sashimis", items: [
    { id: "sashimi-salmao-6", name: "Sashimi Salmão - 6 Fatias", description: "Fatias de salmão.", price: 39, priceLabel: "R$39,00", addedAt: NEW },
    { id: "sashimi-sooba", name: "Sashimi Sooba - 6 Fatias", description: "Fatias de salmão, finalizado com tarê, raspas de limão siciliano e ovas.", price: 45, priceLabel: "R$45,00", addedAt: NEW },
    { id: "sashimi-crispe", name: "Sashimi Crispe - 6 Fatias", description: "Fatias de salmão levemente maçaricado, finalizado com tarê, geleia de pimenta e crispe de couve.", price: 42.5, priceLabel: "R$42,50", addedAt: NEW },
    { id: "sashimi-shakeramura", name: "Sashimi Shakeramura - 6 Fatias", description: "Fatias de salmão, finalizado com geleia de maracujá, tarê e crispe de batata doce.", price: 42, priceLabel: "R$42,00", addedAt: NEW },
  ] },
  { id: "uramakis", eyebrow: "Uramakis", title: "Uramakis", items: [
    { id: "uramaki-fila-sooba", name: "Uramaki Fila Sooba - 8 unidades", description: "Salmão, cream cheese, tira de salmão maçaricado, finalizado com tarê e raspas de limão siciliano.", price: 50, priceLabel: "R$50,00", addedAt: NEW },
    { id: "uramaki-salmao-crispe", name: "Uramaki Salmão Crispe - 8 unidades", description: "Salmão empanado, cream cheese, finalizado com geleia de pimenta, tarê e crispe de batata doce.", price: 45, priceLabel: "R$45,00", addedAt: NEW },
    { id: "uramaki-salmao-ebi", name: "Uramaki Salmão Ebi - 8 unidades", description: "Salmão, camarão empanado, cream cheese, tira de salmão, finalizado com mel e lâminas de amêndoas.", price: 55, priceLabel: "R$55,00", addedAt: NEW },
    { id: "uramaki-fila-sooba-especial", name: "Uramaki Fila Sooba Especial - 8 Unidades", description: "Salmão, cream cheese, tira de salmão maçaricado, finalizado com tarê, raspas de limão siciliano, azeite trufado, ovas e flor de sal.", price: 55, priceLabel: "R$55,00", addedAt: NEW },
    { id: "uramaki-ebitai", name: "Uramaki Ebitai - 8 Unidades", description: "Camarão empanado, cream cheese, tira de salmão, finalizado com geleia de maracujá, tarê e crispe de alho poró.", price: 55, priceLabel: "R$55,00", addedAt: NEW },
    { id: "uramaki-filadelfia-8", name: "Uramaki Filadélfia - 8 Unidades", description: "Salmão e cream cheese.", price: 40, priceLabel: "R$40,00", addedAt: NEW },
    { id: "uramaki-nachos", name: "Uramaki Nachos - 8 Unidades", description: "Salmão, cream cheese, finalizado com geleia de pimenta e Doritos.", price: 45, priceLabel: "R$45,00", addedAt: NEW },
    { id: "uramaki-ebiten", name: "Uramaki Ebiten - 8 Unidades", description: "Camarão empanado, cream cheese, finalizado com tarê e cebolinha.", price: 45, priceLabel: "R$45,00", addedAt: NEW },
  ] },
  { id: "hots", eyebrow: "Hots", title: "Hots", items: [
    { id: "hot-crispe", name: "Hot Crispe - 8 unidades", description: "Sushi de salmão empanado e frito, finalizado com cream cheese, geleia de pimenta, tarê e crispe de couve.", price: 37, priceLabel: "R$37,00", addedAt: NEW },
    { id: "hot-fila", name: "Hot Fila - 8 unidades", description: "Sushi de salmão empanado e frito, finalizado com cream cheese, tarê e cebolinha.", price: 35, priceLabel: "R$35,00", addedAt: NEW },
    { id: "hot-salmao-supremo", name: "Hot Salmão Supremo - 8 unidades", description: "Sushi de salmão empanado e frito, finalizado com salmão batido, tarê e cebolinha.", price: 42, priceLabel: "R$42,00", addedAt: NEW },
    { id: "hot-nachos", name: "Hot Nachos - 8 unidades", description: "Sushi de salmão empanado e frito, finalizado com cream cheese, geleia de pimenta, tarê e Doritos.", price: 37, priceLabel: "R$37,00", addedAt: NEW },
  ] },
  { id: "sophia-jows", eyebrow: "Sophia e Jows", title: "Sophia e Jows", items: [
    { id: "sophia-especial", name: "Sophia Especial - 4 unidades", description: "Enrolado de salmão maçaricado, camarão empanado, cream cheese, finalizado com tarê, geleia de pimenta e cebolinha.", price: 45, priceLabel: "R$45,00", addedAt: NEW },
    { id: "sophia-sooba", name: "Sophia Sooba - 4 unidades", description: "Enrolado de salmão maçaricado, camarão empanado, cream cheese, finalizado com geleia de maracujá, tarê e crispe de batata doce.", price: 45, priceLabel: "R$45,00", addedAt: NEW },
    { id: "sophia-salmao", name: "Sophia Salmão - 4 unidades", description: "Enrolado de salmão, cream cheese, finalizado com tarê e cebolinha.", price: 35, priceLabel: "R$35,00", addedAt: NEW },
    { id: "sophia-bravo-san", name: "Sophia Bravo San - 4 unidades", description: "Enrolado de salmão maçaricado, camarão empanado, cream cheese, finalizado com queijo brie, mel e crispe de alho poró.", price: 50, priceLabel: "R$50,00", addedAt: NEW },
    { id: "sophia-shimeji", name: "Sophia Shimeji - 4 unidades", description: "Enrolado de salmão maçaricado, shimeji com cream cheese, finalizado com tarê e cebolinha.", price: 40, priceLabel: "R$40,00", addedAt: NEW },
    { id: "sophia-eva", name: "Sophia Eva - 4 unidades", description: "Enrolado de salmão maçaricado, salmão empanado, cream cheese, finalizado com tarê, geleia de pimenta e crispe de couve.", price: 42, priceLabel: "R$42,00", addedAt: NEW },
    { id: "jow-tataki", name: "Jow Tataki - 4 unidades", description: "Arroz envolto por fatia fina de salmão, salmão batido, finalizado com tarê e cebolinha.", price: 35, priceLabel: "R$35,00", addedAt: NEW },
    { id: "jow-brie", name: "Jow Brie - 4 unidades", description: "Arroz envolto por fatia fina de salmão maçaricado com queijo brie, finalizado com geleia de pimenta e tarê.", price: 40, priceLabel: "R$40,00", addedAt: NEW },
    { id: "jow-tai", name: "Jow Tai - 4 unidades", description: "Arroz envolto por fatia fina de salmão maçaricado, camarão empanado, cream cheese, finalizado com tarê, geleia de maracujá e crispe de alho poró.", price: 40, priceLabel: "R$40,00", addedAt: NEW },
    { id: "jow-sooba", name: "Jow Sooba - 4 unidades", description: "Arroz envolto por fatia fina de salmão, salmão empanado, cream cheese, finalizado com mel e lâminas de amêndoas.", price: 42, priceLabel: "R$42,00", addedAt: NEW },
    { id: "jow-shimeji", name: "Jow Shimeji - 4 unidades", description: "Arroz envolto por fatia fina de salmão maçaricado, shimeji, cream cheese, finalizado com tarê e cebolinha.", price: 40, priceLabel: "R$40,00", addedAt: NEW },
  ] },
  { id: "niguiris", eyebrow: "Niguiris", title: "Niguiris", items: [
    { id: "niguiri-salmao-trufado", name: "Salmão Trufado - 4 unidades", description: "Salmão, azeite trufado, raspas de limão siciliano e ovas.", price: 38, priceLabel: "R$38,00", addedAt: NEW },
    { id: "niguiri-salmao-brie", name: "Salmão Brie - 4 unidades", description: "Salmão maçaricado, queijo brie, tarê e geleia de pimenta.", price: 38, priceLabel: "R$38,00", addedAt: NEW },
    { id: "niguiri-salmao-especial", name: "Salmão Especial - 4 unidades", description: "Salmão maçaricado, cream cheese, mel e alho poró.", price: 37, priceLabel: "R$37,00", addedAt: NEW },
    { id: "niguiri-salmao", name: "Salmão - 4 unidades", description: "Salmão e flor de sal.", price: 30, priceLabel: "R$30,00", addedAt: NEW },
  ] },
  { id: "temakis", eyebrow: "Temakis", title: "Temakis", items: [
    { id: "temaki-filadelfia", name: "Temaki Filadélfia", description: "Cone de alga envolto em arroz. Salmão em cubos, cream cheese e cebolinha.", price: 35, priceLabel: "R$35,00", addedAt: NEW },
    { id: "temaki-salmao", name: "Temaki Salmão", description: "Cone de alga envolto em arroz. Salmão em cubos.", price: 40, priceLabel: "R$40,00", addedAt: NEW },
    { id: "temaki-hot", name: "Temaki Hot", description: "Cone de alga envolto em arroz. Salmão em cubos, cream cheese, empanado e frito, finalizado com tarê e cebolinha.", price: 45, priceLabel: "R$45,00", addedAt: NEW },
    { id: "temaki-ebiten", name: "Temaki Ebiten", description: "Cone de alga envolto em arroz. Camarão empanado, cream cheese, tarê e cebolinha.", price: 45, priceLabel: "R$45,00", addedAt: NEW },
  ] },
  { id: "porcoes", eyebrow: "Porções individuais", title: "Porções individuais", items: [
    { id: "hot-roll", name: "Hot Roll Filadélfia (8 unidades)", price: 32.9, priceLabel: "$32,90", image: "cardapio/hot-roll.jpg" },
    { id: "hossomaki", name: "Hossomaki (8 unidades)", price: 30.9, priceLabel: "$30,90", image: "cardapio/hossomaki.jpg" },
    { id: "uramaki-grelhado", name: "Uramaki Grelhado (8 unidades)", price: 35.9, priceLabel: "$35,90", image: "cardapio/uramaki-grelhado.jpg" },
    { id: "uramaki-skin", name: "Uramaki Skin (8 unidades)", price: 32.9, priceLabel: "$32,90", image: "cardapio/uramaki-skin.jpg" },
    { id: "sushi-dog", name: "Sushi Dog (120g de salmão cru)", price: 52.9, priceLabel: "$52,90", image: "cardapio/sushi-dog.jpg" },
    { id: "sushi-dog-grelhado", name: "Sushi Dog Salmão Grelhado (120g de salmão grelhado)", price: 52.9, priceLabel: "$52,90", image: "cardapio/sushi-dog-grelhado.jpg" },
    { id: "copo-felicidade", name: "Copo da Felicidade (salmão cru)", description: "150g de salmão, arroz japonês, cream cheese, cebolinha, gergelim e alga nori", price: 49.9, priceLabel: "$49,90", image: "cardapio/copo-felicidade.jpg", addedAt: "2026-09-08", variantGroup: "copo-felicidade", variantLabel: "Salmão cru" },
    { id: "copo-felicidade-grelhado", name: "Copo da Felicidade (salmão grelhado)", description: "150g de salmão grelhado, arroz japonês, cream cheese, cebolinha, gergelim e alga nori", price: 49.9, priceLabel: "$49,90", image: "cardapio/copo-felicidade.jpg", addedAt: "2026-09-08", variantGroup: "copo-felicidade", variantLabel: "Salmão grelhado" },
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
    // Sem foto própria ainda (as fotos "proteico-*.jpg" nunca foram enviadas
    // pro site — davam erro 404). Assim que o cliente mandar foto real desses
    // pratos, é só adicionar o campo image de volta com o arquivo certo.
    { id: "proteico-frango-g", name: "Yaki Proteico Frango (G)", price: 33.9, priceLabel: "R$33,90" },
    { id: "proteico-frango-m", name: "Yaki Proteico Frango (M)", price: 23.9, priceLabel: "R$23,90" },
    { id: "proteico-carne-g", name: "Yaki Proteico Carne (G)", price: 47.9, priceLabel: "R$47,90" },
    { id: "proteico-carne-m", name: "Yaki Proteico Carne (M)", price: 35.9, priceLabel: "R$35,90" },
    { id: "proteico-misto-g", name: "Yaki Proteico Misto (G)", price: 37.9, priceLabel: "R$37,90" },
    { id: "proteico-misto-m", name: "Yaki Proteico Misto (M)", price: 27.9, priceLabel: "R$27,90" },
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

// Os combos da "Promoção do dia" agora são gerenciados pelo admin (ver
// src/dailyCombos.ts) — não ficam mais fixos aqui no código.
