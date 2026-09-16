# Financeiro + Estoque de ingredientes — design

Data: 2026-09-16
Status: aprovado pelo cliente (Leonardo), aguardando plano de implementação

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

ingredientPurchases/{purchaseId}   // histórico/auditoria, não editável depois de criado
  ingredientId: string
  quantity: number
  totalCost: number
  createdAt: Timestamp

menuStatus/recipes
  recipes: { [itemId]: { ingredientId: string; quantity: number }[] }

fixedExpenses/{expenseId}
  name: string
  amount: number

orders/{orderId}   // campos NOVOS no doc que já existe
  stockDeducted: boolean
  ingredientCost: number          // custo total gravado no momento da baixa
  missingRecipeItemIds?: string[] // itens do pedido sem ficha técnica (custo não contabilizado)
  deductedIngredients: { ingredientId: string; quantity: number }[] // exatamente o que foi descontado, pra devolver certinho se o pedido for apagado
```

Regra do Firestore: mesmo padrão de `menuStatus/{document}` já existente
(`allow read: if true; allow write: if request.auth != null;`) cobre
`ingredients`, `menuStatus/recipes` e `fixedExpenses`.
`ingredientPurchases` só precisa de escrita autenticada (nunca lido pelo
site público).

## Fluxos principais

### Registrar compra
Admin escolhe o ingrediente, digita quantidade + valor pago. Se
`novoCustoUnitario` estiver fora de uma faixa razoável do `avgCost` atual
(ex.: mais de 3x maior ou menor que o atual, só quando já existe estoque/
custo anterior pra comparar), mostra confirmação antes de salvar. Ao
confirmar: grava em `ingredientPurchases`, atualiza `ingredients/{id}` com
`stock += quantity` e novo `avgCost` pela média ponderada:
`novoAvgCost = (stockAtual * avgCostAtual + quantity * unitCost) / (stockAtual + quantity)`.

### Baixa automática de estoque (no pedido novo)
Reaproveita o `onSnapshot` de pedidos já existente no admin (mesmo lugar que
hoje dispara o som e a impressão automática). Pra cada pedido novo ainda sem
`stockDeducted`, roda uma transação Firestore:
1. Relê o doc do pedido — se `stockDeducted` já for `true` (outra aba já
   processou), aborta sem fazer nada.
2. Pra cada item do pedido, busca a receita em `menuStatus/recipes`. Item
   sem receita entra em `missingRecipeItemIds`, custo dele conta como 0.
3. Soma o consumo total por ingrediente (multiplicando pela quantidade do
   item no pedido).
4. Lê cada `ingredients/{id}` envolvido, decrementa `stock`, soma
   `quantidadeUsada * avgCost` no custo total do pedido.
5. Grava tudo isso na mesma transação: novo `stock` de cada ingrediente +
   `stockDeducted: true`, `ingredientCost`, `missingRecipeItemIds` no pedido.

Isso garante baixa única mesmo com o painel aberto em mais de um
computador ao mesmo tempo (a transação serializa: a segunda tentativa lê
`stockDeducted: true` e não faz nada).

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
  dos pedidos do período), Margem = Bruto − Custo variável.
- Card Mês: os mesmos + Gastos fixos (soma de `fixedExpenses`) + **Lucro
  líquido real** = Bruto − Custo variável − Gastos fixos.
- Se algum pedido do período tiver `missingRecipeItemIds` não vazio, mostra
  aviso "N pedidos com prato sem ficha técnica — custo pode estar
  subestimado".
- Ranking de pratos: pra cada item com ficha técnica, margem atual = preço
  de venda − custo atual (soma da receita × `avgCost` de cada ingrediente
  hoje). Ordena do mais lucrativo pro menos. Itens sem ficha técnica
  aparecem separados, marcados "sem ficha técnica".

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
  já existentes): a receita é sempre por id-base do prato, então a baixa de
  estoque funciona igual sem precisar de nenhum tratamento especial pra
  instância/addon.
