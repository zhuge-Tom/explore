"use client";

import { useState } from "react";

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
  onSubmit: (value: string) => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState("");

  function submit() {
    const v = value.trim();
    if (!v) return;
    onSubmit(v);
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
        <div className="modal-actions">
          <button className="primary" onClick={submit} disabled={!value.trim()}>
            {submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
