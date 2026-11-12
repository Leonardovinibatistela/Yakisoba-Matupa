// Miniaturas pra faixa "Combo do dia e mais pedidos" (logo abaixo do topo): os cartões mostram a foto em ~160x100 px, mas as fotos do
// cardápio são originais de até ~900 KB. Como a faixa fica no começo da página (carrega junto), usamos uma versão pequena:
// - fotos do site (cardapio/x.jpg)  -> cardapio/thumb/x.jpg (gerada junto, ~20 KB)
// - fotos enviadas pelo painel (Cloudinary) -> a mesma foto com largura limitada e formato automático
// Se a miniatura não carregar, quem usa volta pra foto original (ver onError na faixa).

const SITE_PHOTO = /^(\.?\/?)cardapio\/([^/?#]+)\.(?:jpe?g|png|webp)$/i;
const CLOUDINARY_PHOTO = /^(https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/)(.+)$/;
const ALREADY_TRANSFORMED = /^[a-z]{1,3}_[^/]*\//; // ex.: "w_300,c_fill/..."

export const THUMB_WIDTH = 400;

export function stripThumbUrl(url: string | undefined): string | undefined {
  if (!url) return url;
  const site = SITE_PHOTO.exec(url);
  if (site) return `${site[1]}cardapio/thumb/${site[2]}.jpg`;
  const cloud = CLOUDINARY_PHOTO.exec(url);
  if (cloud && !ALREADY_TRANSFORMED.test(cloud[2])) return `${cloud[1]}w_${THUMB_WIDTH},c_limit,f_auto,q_auto/${cloud[2]}`;
  return url;
}
