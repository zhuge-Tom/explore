"use client";

import { useRef, useState, type ClipboardEvent, type DragEvent } from "react";
import type { ImageAttachment } from "@/lib/image-attachments";

export type ClientImageAttachment = ImageAttachment & { previewUrl: string };

const MAX_IMAGES = 4;

export function ImagePicker({
  images,
  onChange,
  disabled = false,
}: {
  images: ClientImageAttachment[];
  onChange: (images: ClientImageAttachment[]) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");

  async function addFiles(files: File[]) {
    const candidates = files.filter((file) => file.type.startsWith("image/"));
    if (!candidates.length || disabled || uploading) return;
    const available = MAX_IMAGES - images.length;
    if (available <= 0) {
      setMessage(`最多添加 ${MAX_IMAGES} 张图片`);
      return;
    }
    setUploading(true);
    setMessage("");
    const accepted = candidates.slice(0, available);
    const uploaded: ClientImageAttachment[] = [];
    try {
      for (const file of accepted) {
        const form = new FormData();
        form.append("file", file);
        const response = await fetch("/api/images", { method: "POST", body: form });
        const data = await response.json() as { image?: ImageAttachment; error?: string };
        if (!response.ok || !data.image) throw new Error(data.error ?? "图片上传失败");
        uploaded.push({ ...data.image, previewUrl: URL.createObjectURL(file) });
      }
      onChange([...images, ...uploaded]);
      if (candidates.length > available) setMessage(`最多添加 ${MAX_IMAGES} 张图片，已忽略多余图片`);
    } catch (error) {
      uploaded.forEach((image) => URL.revokeObjectURL(image.previewUrl));
      setMessage(error instanceof Error ? error.message : "图片上传失败");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function remove(id: string) {
    const image = images.find((item) => item.id === id);
    if (image) URL.revokeObjectURL(image.previewUrl);
    onChange(images.filter((item) => item.id !== id));
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    void addFiles(Array.from(event.dataTransfer.files));
  }

  function onPaste(event: ClipboardEvent<HTMLDivElement>) {
    const files = Array.from(event.clipboardData.files);
    if (!files.some((file) => file.type.startsWith("image/"))) return;
    event.preventDefault();
    void addFiles(files);
  }

  return (
    <div className="image-picker">
      <div
        className={`image-dropzone${uploading ? " uploading" : ""}`}
        tabIndex={0}
        role="button"
        aria-label="添加图片"
        onClick={() => !disabled && inputRef.current?.click()}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") inputRef.current?.click();
        }}
        onDragOver={(event) => event.preventDefault()}
        onDrop={onDrop}
        onPaste={onPaste}
      >
        <span>{uploading ? "正在上传图片…" : "添加图片"}</span>
        <small>点击、拖入，或在此处粘贴</small>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        multiple
        hidden
        onChange={(event) => void addFiles(Array.from(event.target.files ?? []))}
      />
      {images.length > 0 && (
        <div className="image-preview-list" aria-label="已添加图片">
          {images.map((image) => (
            <div className="image-preview" key={image.id}>
              <img src={image.previewUrl} alt={image.name} />
              <button type="button" onClick={() => remove(image.id)} aria-label={`移除图片 ${image.name}`}>×</button>
            </div>
          ))}
        </div>
      )}
      {message && <p className="image-picker-message">{message}</p>}
    </div>
  );
}
