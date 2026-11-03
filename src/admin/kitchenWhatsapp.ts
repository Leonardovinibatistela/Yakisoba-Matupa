// Aviso de "pedido pronto" pelo WhatsApp (só regra — sem navegador nem Firebase, pra dar pra testar sozinho).
// Não manda nada sozinho: monta o link wa.me com a mensagem pronta; quem está na cozinha só aperta "enviar" no WhatsApp.
import type { KitchenTicket } from "./kitchenView";

/** DDD de Matupá/MT: usado quando o cliente digitou só o número (9 dígitos), sem DDD. */
const DEFAULT_DDD = "66";

/**
 * Telefone digitado livremente ("(66) 99613-8482", "+55 66 99613-8482", "99613-8482"...) → número do wa.me
 * (só dígitos, com 55 na frente). Devolve null quando não dá pra ter certeza de que é um telefone do Brasil.
 */
export function whatsappNumber(raw: string): string | null {
  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("0055")) digits = digits.slice(2);
  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) {
    const validMobile = digits.length === 12 || digits[4] === "9";
    return validMobile && /^55[1-9]{2}/.test(digits) ? digits : null;
  }
  digits = digits.replace(/^0(?=[1-9])/, ""); // "0" da operadora antes do DDD (066 99613-8482)
  if (digits.length === 9 && digits[0] === "9") digits = DEFAULT_DDD + digits;
  if (digits.length !== 10 && digits.length !== 11) return null;
  if (digits.length === 11 && digits[2] !== "9") return null;
  return /^[1-9]{2}/.test(digits) ? `55${digits}` : null;
}

/** Primeiro nome pro "Oi, Fulano!"; arruma maiúscula/minúscula só quando o nome veio todo em caixa alta ou baixa. */
export function firstName(name: string): string {
  const first = name.trim().split(/\s+/)[0] ?? "";
  if (!first) return "";
  const allSameCase = first === first.toLocaleUpperCase("pt-BR") || first === first.toLocaleLowerCase("pt-BR");
  return allSameCase ? first.charAt(0).toLocaleUpperCase("pt-BR") + first.slice(1).toLocaleLowerCase("pt-BR") : first;
}

/** Texto do aviso (sem nenhum valor em R$). Retirada e entrega têm frases diferentes. */
export function readyMessage(ticket: Pick<KitchenTicket, "kind" | "number" | "customerName">): string {
  const name = firstName(ticket.customerName);
  const hello = name ? `Oi, ${name}!` : "Oi!";
  if (ticket.kind === "retirada") return `${hello} Seu pedido #${ticket.number} está pronto, pode vir retirar 😊`;
  if (ticket.kind === "entrega") return `${hello} Seu pedido #${ticket.number} ficou pronto e já vai sair pra entrega 🛵`;
  return `${hello} Seu pedido #${ticket.number} está pronto 😊`;
}

/** Link que abre a conversa do cliente no WhatsApp com a mensagem pronta; null quando o pedido não tem telefone válido. */
export function whatsappReadyLink(ticket: Pick<KitchenTicket, "kind" | "number" | "customerName" | "phone">): string | null {
  const number = whatsappNumber(ticket.phone);
  return number ? `https://wa.me/${number}?text=${encodeURIComponent(readyMessage(ticket))}` : null;
}
