# Financeiro + Estoque de ingredientes — design

Data: 2026-09-16
Status: aprovado pelo cliente (Leonardo); revisado uma segunda vez após
review técnico externo — achados incorporados abaixo (marcados **[revisão]**).

## Contexto e objetivo

Hoje o painel admin do Sooba mostra só o **faturamento bruto** (Hoje/Semana/Mês).
O cliente vendeu um sistema adicional (R$500) pra dar visibilidade real de
**quanto sobra de verdade** — descontando o custo dos ingredientes usados e as
despesas fixas do mês (aluguel, luz, funcionário etc.), não só o valor que
entrou.

Esse recurso é pensado pra depois ser copiado e revendido pra outros clientes
— por isso o modelo de dados é genérico (baseado em id de item de cardápio),
não amarrado a nenhum prato específico do Sooba.

## Escopo do MVP

**Entra:**
- Cadastro de ingredientes (nome, unidade kg/l/un, estoque atual, custo médio).
- Registrar compra de ingrediente (soma no estoque, recalcula custo médio
  ponderado) — com aviso se o preço digitado for muito diferente do custo
  médio atual.
- Ajuste manual de estoque (corrigir quantidade sem mexer no custo — ex:
  perda, quebra, gastou mais que o previsto).
- **[revisão]** Editar ou apagar uma compra registrada por engano (ex.: dígito
  a mais no valor) — o custo médio é recalculado do zero a partir do
  histórico de compras que sobrou, nunca fica "preso" num valor errado.
- **[revisão]** Taxa de pagamento configurável por forma de pagamento (Pix/
  Cartão/Dinheiro) — desconta do lucro líquido igual custo de ingrediente,
  já que o pedido já grava qual foi a forma de pagamento.
- Ficha técnica por prato (quais ingredientes + quanto de cada um) — visível
  só no admin, dentro da aba "Cardápio", nunca no site público.
- Baixa automática de estoque quando um pedido novo chega, com o custo do
  pedido gravado nele (`ingredientCost`) pra não distorcer relatórios
  passados se o custo do ingrediente mudar depois.
- Devolver os ingredientes ao estoque automaticamente se um pedido que já
  descontou estoque for apagado.
- Cadastro simples de despesas fixas (nome + valor mensal).
- Aba nova "Financeiro" no admin: Bruto, Gasto variável (ingredientes),
  Gastos fixos, Lucro líquido real (mês) — e Bruto − Gasto variável nas
  visões de Hoje/Semana (gasto fixo só entra na visão de mês).
- Ranking de pratos por margem atual (preço − custo atual da ficha técnica),
  mostrando "sem ficha técnica" pros que ainda não foram cadastrados em vez
  de custo R$0.
- Gasto variável do mês calculado por **soma das compras registradas**
  funciona mesmo antes de qualquer ficha técnica existir — dá visão
  aproximada desde o primeiro dia, independente do cadastro de receitas.

**Fica de fora por agora (YAGNI, mencionar se o cliente perguntar):**
- Alertas de estoque baixo / mínimo.
- Relatório de histórico de compras com filtro por período.
- Rateio proporcional de gasto fixo pra visões de dia/semana.
- Multi-loja / múltiplos usuários com permissões diferentes.
- Custeio FIFO/por lote — usamos custo médio ponderado simples.
- **[revisão]** Fator de rendimento/perda por ingrediente (ex.: 1kg de
  cebola crua rende só 850g limpa). Pro MVP, a ficha técnica é preenchida
  já com a quantidade **bruta** consumida (a UI deixa isso explícito) —
  resolve sem precisar de campo novo, só pede um pouco mais de conta na
  hora de cadastrar. Campo de rendimento automático fica pra depois.
- **[revisão]** Unidade de compra diferente da unidade de estoque (comprar
  "1 caixa com 50 unidades" e o sistema converter sozinho) — pro MVP, o
  aviso de preço fora do padrão (ver abaixo) já pega a maior parte desse
  erro depois da primeira compra; a UI só reforça com um texto de ajuda.

## Modelo de dados (Firestore)

Reaproveita o padrão já usado em `priceOverrides`/`nameOverrides`/etc.
(objeto aninhado de verdade, nunca chave com ponto literal — bug já visto
nesse projeto).

```
ingredients/{ingredientId}
  name: string
  unit: "kg" | "l" | "un"
  stock: number
  avgCost: number       // custo médio ponderado por unidade

ingredientPurchases/{purchaseId}   // [revisão] editável/apagável — ver "Corrigir uma compra"
  ingredientId: string
  quantity: number
  totalCost: number
  createdAt: Timestamp

menuStatus/recipes
  recipes: { [itemId]: { ingredientId: string; quantity: number }[] }

menuStatus/paymentFees   // [revisão] taxa % por forma de pagamento
  rates: { pix: number; cartao: number; dinheiro: number } // ex.: cartao: 0.035 = 3,5%

fixedExpenses/{expenseId}
  name: string
  amount: number

orders/{orderId}   // campos NOVOS no doc que já existe
  stockDeducted: boolean
  ingredientCost: number             // custo total gravado no momento da baixa
  missingRecipeItemIds: string[]     // itens do pedido sem ficha técnica nenhuma
  incompleteCostItemIds: string[]    // [revisão] itens COM ficha técnica, mas que usam ingrediente sem custo real (nunca comprado, ou apagado) — custo desses itens contou como 0 nessa baixa
  deductedIngredients: { ingredientId: string; quantity: number }[] // exatamente o que foi descontado, pra devolver certinho se o pedido for apagado
```

Regra do Firestore: mesmo padrão de `menuStatus/{document}` já existente
(`allow read: if true; allow write: if request.auth != null;`) cobre
`ingredients`, `menuStatus/recipes`, `menuStatus/paymentFees` e
`fixedExpenses`. `ingredientPurchases` só precisa de escrita autenticada
(nunca lido pelo site público).

## Fluxos principais

### Registrar compra
Admin escolhe o ingrediente, digita quantidade + valor pago. Se
`novoCustoUnitario` estiver fora de uma faixa razoável do `avgCost` atual
(ex.: mais de 3x maior ou menor que o atual, só quando já existe estoque/
custo anterior pra comparar), mostra confirmação antes de salvar — texto de
ajuda no formulário reforça "lança na mesma unidade da nota fiscal" (mitiga
o caso de comprar 1 caixa com 50 unidades e lançar como "1 unidade" pelo
preço da caixa inteira). Ao confirmar: grava em `ingredientPurchases`,
atualiza `ingredients/{id}` com `stock += quantity` e novo `avgCost` pela
média ponderada:
`novoAvgCost = (stockAtual * avgCostAtual + quantity * unitCost) / (stockAtual + quantity)`.

### Corrigir uma compra **[revisão]**
Editar ou apagar uma compra (`ingredientPurchases/{id}`) **recalcula o
`avgCost` do zero**, somando `totalCost`/`quantity` de TODAS as compras que
sobraram daquele ingrediente (nunca faz conta incremental em cima do valor
errado) — assim um erro de digitação não fica preso pra sempre no custo
médio. Ao mesmo tempo, ajusta `stock` pela diferença entre a quantidade
antiga e a nova (ou subtrai tudo, se apagou). Se isso deixar `stock`
negativo, deixa — é um sinal útil de "venderam mais do que compraram
registrado", não um erro pra bloquear.
Limitação aceita: o recálculo do `avgCost` lê o histórico de compras fora
de uma transação (Firestore não permite consulta por filtro dentro de
transação) — só a escrita final (estoque + custo) é transacional. Numa
loja pequena com uma pessoa mexendo no painel por vez, o risco de duas
edições de compra colidirem ao mesmo tempo é desprezível.

### Baixa automática de estoque (no pedido novo)
Reaproveita o `onSnapshot` de pedidos já existente no admin (mesmo lugar que
hoje dispara o som e a impressão automática). Pra cada pedido novo ainda sem
`stockDeducted`, roda uma transação Firestore:
1. Relê o doc do pedido — se `stockDeducted` já for `true` (outra aba já
   processou), aborta sem fazer nada.
2. **[revisão]** Lê `menuStatus/recipes` **direto do Firestore, dentro da
   própria transação** — não recebe a receita como parâmetro vindo do
   estado do React. Isso é de propósito: se recebesse do React, existiria
   uma corrida real entre "o pedido chegou" e "a assinatura de receitas
   ainda não tinha carregado no navegador" — e como o custo do pedido nunca
   é recalculado depois, um erro assim ficaria permanente. Lendo direto do
   banco (igual já faz com os ingredientes), esse risco não existe.
3. Pra cada item do pedido, busca a receita. Item **sem receita nenhuma**
   entra em `missingRecipeItemIds`. Item **com receita, mas que usa algum
   ingrediente sem custo real** (nunca comprado — `avgCost` ainda no
   default — ou apagado) entra em `incompleteCostItemIds`; a contribuição
   desse ingrediente conta como 0 no custo, mas fica **sinalizada**, nunca
   escondida.
4. Soma o consumo total por ingrediente (multiplicando pela quantidade do
   item no pedido).
5. Lê cada `ingredients/{id}` envolvido, decrementa `stock`, soma
   `quantidadeUsada * avgCost` no custo total do pedido.
6. Grava tudo isso na mesma transação: novo `stock` de cada ingrediente +
   `stockDeducted: true`, `ingredientCost`, `missingRecipeItemIds`,
   `incompleteCostItemIds` no pedido.

Isso garante baixa única mesmo com o painel aberto em mais de um
computador ao mesmo tempo (a transação serializa: a segunda tentativa lê
`stockDeducted: true` e não faz nada).

### Recuperação de baixa que falhou **[revisão]**
Se a transação falhar (rede caiu, etc.), o pedido fica sem `stockDeducted`
e, sem nenhum tratamento, nunca mais tentaria de novo. Ao abrir o painel, além
de escutar pedido novo, roda uma varredura **única** (silenciosa, sem
banner de erro) nos pedidos já carregados que ainda não tiverem
`stockDeducted`, tentando descontar de novo — exceto o pedido que estiver
sendo apagado naquele exato momento (evita brigar com a devolução de
estoque descrita abaixo). Como a transação é idempotente (passo 1 acima),
tentar de novo nunca duplica nada.

### Apagar pedido
Se o pedido apagado tinha `stockDeducted: true`, antes de apagar o doc, uma
transação devolve ao estoque a mesma quantidade de cada ingrediente que
tinha sido descontada (repete o cálculo da ficha técnica, ou — mais simples
e seguro — grava no próprio pedido, no momento da baixa, exatamente quanto
foi descontado de cada ingrediente, pra devolução não depender de
recalcular a receita, que pode ter mudado desde então). Optamos por gravar
esse detalhe (`deductedIngredients: {ingredientId, quantity}[]`) no pedido
junto com `ingredientCost`, pra devolução ser sempre exata.

### Ficha técnica (admin, aba Cardápio)
Cada item do cardápio (base ou custom) ganha um editor de receita: lista de
`{ingrediente, quantidade}`, salva em `menuStatus/recipes.{itemId}`. Usa o
mesmo id que já identifica o item em `priceOverrides`/`nameOverrides`/etc,
então funciona igual pra item base, item custom e combo do dia.

### Aba "Financeiro"
- Cards Hoje/Semana: Bruto, Custo variável (soma de `order.ingredientCost`
  dos pedidos do período), **[revisão]** Taxa de pagamento (soma de
  `order.total * rates[order.paymentMethod]`), Margem = Bruto − Custo
  variável − Taxa de pagamento.
- Card Mês: os mesmos + Gastos fixos (soma de `fixedExpenses`) + **Lucro
  líquido real** = Bruto − Custo variável − Taxa de pagamento − Gastos fixos.
- Card Mês mostra também, como número auxiliar separado, o **Total
  comprado no mês** (soma de `ingredientPurchases` do período) — essa é a
  visão "Nível 1" que funciona mesmo sem nenhuma ficha técnica cadastrada
  ainda (mede quanto saiu do caixa comprando, não quanto foi de fato
  consumido pelo que foi vendido). Fica marcado como número aproximado,
  distinto do Custo variável "de verdade" (que vem das vendas).
- Se algum pedido do período tiver `missingRecipeItemIds` não vazio, mostra
  aviso "N pedidos com prato sem ficha técnica — custo pode estar
  subestimado". **[revisão]** Mesma lógica pra `incompleteCostItemIds`
  (ficha técnica existe, mas algum ingrediente dela não tem custo real
  cadastrado) — aviso separado, mesmo motivo.
- Ranking de pratos: pra cada item com ficha técnica, margem atual = preço
  de venda − custo atual (soma da receita × `avgCost` de cada ingrediente
  hoje). Ordena do mais lucrativo pro menos. **[revisão]** O cálculo do
  custo atual devolve `{ cost, complete }`, nunca só um número — item com
  algum ingrediente sem custo real (nunca comprado, ou apagado) tem
  `complete: false` e aparece marcado como "custo incompleto" em vez de
  entrar no ranking como se fosse um número confiável. Itens sem ficha
  técnica nenhuma continuam aparecendo separados, marcados "sem ficha
  técnica".
- **[revisão]** Taxa de pagamento (Pix/Cartão/Dinheiro) é configurável numa
  telinha simples dentro do Financeiro — 3 campos de porcentagem.

## Casos de borda já decididos

- **Item sem ficha técnica**: nunca conta como custo R$0 silenciosamente —
  sempre sinalizado em algum aviso visível.
- **Custo histórico vs atual**: `order.ingredientCost` é gravado no momento
  do pedido (não recalculado depois) — relatório de "mês passado" continua
  correto mesmo que o preço do ingrediente tenha mudado. Já o ranking "qual
  prato dá lucro hoje" usa custo atual de propósito (é pra decisão de preço
  daqui pra frente).
- **Gasto fixo só entra na visão mensal** — dividir aluguel por dia/semana
  seria impreciso e foi descartado por ora.
- **Yaki com múltiplas unidades/addons** (`makeInstanceId`/`ADDON_SEPARATOR`
  já existentes): cada adicional (ex.: "Extra de Carne") já chega como uma
  linha **própria e independente** dentro de `order.items` (com seu próprio
  id, resolvido pelo `resolveRecipeItemId`), então o cálculo de consumo
  passa por cada linha separadamente — soma a receita do prato base **e**
  a receita do adicional, cada um com sua própria ficha técnica cadastrada
  no admin. Não precisa de nenhum tratamento especial: testado explicitamente
  no Task 4 do plano de implementação.
- **[revisão] Custo R$0 mascarado**: `avgCost` de um ingrediente nunca
  comprado (ou apagado depois de estar numa ficha técnica) é 0 por padrão —
  isso NUNCA pode ser confundido com "esse ingrediente realmente não
  custa nada". Todo cálculo de custo (baixa de estoque e ranking de
  margem) carrega junto um sinal de "completo/incompleto", nunca só o
  número.
- **[revisão] Corrigir compra registrada errada**: editar/apagar uma compra
  recalcula `avgCost` do zero a partir do histórico que sobrou (nunca em
  cima do valor errado) — ver "Corrigir uma compra" acima.
- **[revisão] Taxa de pagamento**: cartão/maquininha come uma % do
  faturamento que não é custo de ingrediente nem despesa fixa — entra como
  linha própria no cálculo de lucro líquido, configurável por forma de
  pagamento.
- **[revisão] Fator de rendimento**: fica fora do MVP por decisão explícita
  (ver "Fica de fora por agora") — ficha técnica é preenchida com
  quantidade bruta, não líquida.
