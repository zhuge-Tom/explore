export const IMAGE_CONTEXT_PREFIX = "__explore_images__:";

export type ImageAttachment = {
  id: string;
  name: string;
  mimeType: "image/jpeg" | "image/png" | "image/webp" | "image/gif";
  localPath: string;
};

export type ImageContext = {
  quote?: string;
  images: ImageAttachment[];
};

const MIME_TYPES = new Set<ImageAttachment["mimeType"]>([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

export function isImageAttachment(value: unknown): value is ImageAttachment {
  if (!value || typeof value !== "object") return false;
  const image = value as Record<string, unknown>;
  return (
    typeof image.id === "string" &&
    typeof image.name === "string" &&
    typeof image.localPath === "string" &&
    /^images\/[0-9a-f-]{36}\.bin$/i.test(image.localPath) &&
    MIME_TYPES.has(image.mimeType as ImageAttachment["mimeType"])
  );
}

export function encodeImageContext(context: ImageContext): string {
  return IMAGE_CONTEXT_PREFIX + JSON.stringify(context);
}

export function decodeImageContext(value: string | null | undefined): ImageContext | null {
  if (!value?.startsWith(IMAGE_CONTEXT_PREFIX)) return null;
  try {
    const parsed = JSON.parse(value.slice(IMAGE_CONTEXT_PREFIX.length)) as Partial<ImageContext>;
    const images = Array.isArray(parsed.images) ? parsed.images.filter(isImageAttachment) : [];
    if (!images.length) return null;
    return { quote: typeof parsed.quote === "string" ? parsed.quote : undefined, images };
  } catch {
    return null;
  }
}
