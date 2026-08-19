const CLOUD_NAME = "ni1jrsaz";
const UPLOAD_PRESET = "sooba_carrossel";

/**
 * Sobe uma imagem direto do navegador pro Cloudinary usando um upload preset
 * "Unsigned" — não precisa (e não deve) usar api_key/api_secret aqui, essa é
 * a forma segura de fazer upload direto do cliente sem expor segredo nenhum.
 */
export async function uploadImageToCloudinary(file: File): Promise<{ url: string; publicId: string }> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", UPLOAD_PRESET);
  const response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, { method: "POST", body: formData });
  if (!response.ok) throw new Error("Falha no upload da imagem para o Cloudinary.");
  const data = await response.json();
  return { url: data.secure_url as string, publicId: data.public_id as string };
}
