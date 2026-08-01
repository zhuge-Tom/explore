"use client";

import { useState } from "react";
import { ImagePicker, type ClientImageAttachment } from "./ImagePicker";

export function InputModal({
  title,
  hint,
  placeholder,
  submitLabel,
  onSubmit,
  onClose,
}: {
  title: string;
  hint?: string;
  placeholder: string;
  submitLabel: string;
  onSubmit: (value: string, images: ClientImageAttachment[]) => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState("");
  const [images, setImages] = useState<ClientImageAttachment[]>([]);

  function submit() {
    const v = value.trim();
    if (!v && images.length === 0) return;
    onSubmit(v || "请分析这张图片", images);
    onClose();
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="modal-close" onClick={onClose}>
            ×
          </button>
        </div>
        {hint && <p className="modal-hint">{hint}</p>}
        <input
          className="modal-input"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
            if (e.key === "Escape") onClose();
          }}
        />
        <ImagePicker images={images} onChange={setImages} />
        <div className="modal-actions">
          <button className="primary" onClick={submit} disabled={!value.trim() && images.length === 0}>
            {submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
