"use client";

import { useState, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Pencil, X, Plus, Trash2, Upload, Loader2 } from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Field schema types                                                 */
/* ------------------------------------------------------------------ */
export interface TextField {
  type: "text";
  label: string;
  key: string;
}

export interface TextareaField {
  type: "textarea";
  label: string;
  key: string;
}

export interface ImageField {
  type: "image";
  label: string;
  key: string;
}

export interface ColorField {
  type: "color";
  label: string;
  key: string;
  options: { label: string; value: string }[];
}

export interface ListField {
  type: "list";
  label: string;
  key: string;
  itemFields: (TextField | TextareaField | ImageField)[];
}

export type FieldSchema = TextField | TextareaField | ImageField | ColorField | ListField;

/* ------------------------------------------------------------------ */
/*  ImageUpload                                                        */
/* ------------------------------------------------------------------ */
function ImageUpload({
  value,
  onChange,
  compact,
}: {
  value: string;
  onChange: (url: string) => void;
  compact?: boolean;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/admin/upload", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Upload failed");
      } else {
        onChange(data.url);
      }
    } catch {
      setError("Upload failed");
    }
    setUploading(false);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith("image/")) handleFile(file);
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }

  const thumbSize = compact ? "h-16 w-24" : "h-24 w-36";

  return (
    <div className="space-y-2">
      <div className="flex items-start gap-3">
        {/* Thumbnail */}
        {value ? (
          <div className={`relative ${thumbSize} shrink-0 rounded-md overflow-hidden ring-1 ring-black/10`}>
            <img src={value} alt="Preview" className="h-full w-full object-cover" />
            <button
              type="button"
              onClick={() => onChange("")}
              className="absolute top-0.5 right-0.5 rounded-full bg-black/60 p-0.5 text-white hover:bg-black/80"
            >
              <X className="size-3" />
            </button>
          </div>
        ) : (
          <div
            className={`${thumbSize} shrink-0 rounded-md border-2 border-dashed border-gray-300 flex items-center justify-center text-gray-400 cursor-pointer hover:border-gray-400 hover:text-gray-500 transition-colors`}
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
          >
            {uploading ? (
              <Loader2 className="size-5 animate-spin" />
            ) : (
              <Upload className="size-5" />
            )}
          </div>
        )}

        {/* Upload button + status */}
        <div className="flex-1 min-w-0 space-y-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
            className="text-xs"
          >
            {uploading ? (
              <>
                <Loader2 className="size-3 mr-1 animate-spin" />
                Uploading...
              </>
            ) : value ? (
              "Change image"
            ) : (
              <>
                <Upload className="size-3 mr-1" />
                Upload image
              </>
            )}
          </Button>
          {value && (
            <p className="text-[10px] text-muted-foreground truncate">{value}</p>
          )}
          {error && (
            <p className="text-[10px] text-destructive">{error}</p>
          )}
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleInputChange}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  SectionEditor                                                      */
/* ------------------------------------------------------------------ */
export function SectionEditor({
  sectionKey,
  fields,
  content,
  children,
}: {
  sectionKey: string;
  fields: FieldSchema[];
  content: Record<string, unknown>;
  children: React.ReactNode;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startEditing = useCallback(() => {
    setDraft({ ...content });
    setEditing(true);
    setError(null);
  }, [content]);

  const cancel = useCallback(() => {
    setEditing(false);
    setDraft({});
    setError(null);
  }, []);

  const save = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/site-content", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ section_key: sectionKey, content: draft }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to save");
      } else {
        setEditing(false);
        window.location.reload();
      }
    } catch {
      setError("Network error");
    }
    setSaving(false);
  }, [sectionKey, draft]);

  function updateField(key: string, value: unknown) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  function updateListItem(key: string, index: number, itemKey: string, value: unknown) {
    setDraft((prev) => {
      const list = [...((prev[key] as unknown[]) || [])];
      list[index] = { ...(list[index] as Record<string, unknown>), [itemKey]: value };
      return { ...prev, [key]: list };
    });
  }

  function addListItem(key: string, itemFields: (TextField | TextareaField | ImageField)[]) {
    setDraft((prev) => {
      const list = [...((prev[key] as unknown[]) || [])];
      const newItem: Record<string, string> = {};
      for (const f of itemFields) newItem[f.key] = "";
      list.push(newItem);
      return { ...prev, [key]: list };
    });
  }

  function removeListItem(key: string, index: number) {
    setDraft((prev) => {
      const list = [...((prev[key] as unknown[]) || [])];
      list.splice(index, 1);
      return { ...prev, [key]: list };
    });
  }

  function renderImageField(fieldKey: string, value: string, onChangeValue: (v: string) => void, compact?: boolean) {
    return <ImageUpload value={value} onChange={onChangeValue} compact={compact} />;
  }

  return (
    <div className="relative group/section">
      {/* Edit button — top right */}
      {!editing && (
        <button
          onClick={startEditing}
          className="absolute top-20 right-4 z-[60] flex items-center gap-1.5 rounded-lg bg-white/90 px-3 py-1.5 text-xs font-medium text-navy-900 shadow-lg ring-1 ring-black/10 opacity-0 group-hover/section:opacity-100 transition-opacity hover:bg-white"
        >
          <Pencil className="size-3" />
          Edit
        </button>
      )}

      {/* Section content */}
      {children}

      {/* Editor panel */}
      {editing && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-start justify-center overflow-y-auto">
          <div className="bg-white rounded-xl shadow-2xl m-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between rounded-t-xl z-10">
              <h3 className="font-bold text-lg">Edit Section</h3>
              <Button type="button" variant="ghost" size="sm" onClick={cancel}>
                <X className="size-4" />
              </Button>
            </div>

            <div className="px-6 py-4 space-y-5">
              {error && (
                <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
              )}

              {fields.map((field) => {
                if (field.type === "text") {
                  return (
                    <div key={field.key} className="space-y-1">
                      <Label className="text-xs font-medium">{field.label}</Label>
                      <Input
                        value={(draft[field.key] as string) || ""}
                        onChange={(e) => updateField(field.key, e.target.value)}
                      />
                    </div>
                  );
                }

                if (field.type === "textarea") {
                  return (
                    <div key={field.key} className="space-y-1">
                      <Label className="text-xs font-medium">{field.label}</Label>
                      <Textarea
                        value={(draft[field.key] as string) || ""}
                        onChange={(e) => updateField(field.key, e.target.value)}
                        rows={3}
                      />
                    </div>
                  );
                }

                if (field.type === "image") {
                  return (
                    <div key={field.key} className="space-y-1">
                      <Label className="text-xs font-medium">{field.label}</Label>
                      {renderImageField(
                        field.key,
                        (draft[field.key] as string) || "",
                        (v) => updateField(field.key, v),
                      )}
                    </div>
                  );
                }

                if (field.type === "color") {
                  return (
                    <div key={field.key} className="space-y-1">
                      <Label className="text-xs font-medium">{field.label}</Label>
                      <Select
                        value={(draft[field.key] as string) || ""}
                        onValueChange={(val) => updateField(field.key, val ?? "")}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={field.label} />
                        </SelectTrigger>
                        <SelectContent>
                          {field.options.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  );
                }

                if (field.type === "list") {
                  const items = (draft[field.key] as Record<string, unknown>[]) || [];
                  return (
                    <div key={field.key} className="space-y-3">
                      <Label className="text-xs font-medium">{field.label}</Label>
                      {items.map((item, idx) => (
                        <div key={idx} className="rounded-lg border p-3 space-y-2 relative">
                          <button
                            type="button"
                            onClick={() => removeListItem(field.key, idx)}
                            className="absolute top-2 right-2 text-destructive hover:text-destructive/80"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                          {field.itemFields.map((itemField) => (
                            <div key={itemField.key} className="space-y-1">
                              <Label className="text-[11px] text-muted-foreground">{itemField.label}</Label>
                              {itemField.type === "textarea" ? (
                                <Textarea
                                  value={(item[itemField.key] as string) || ""}
                                  onChange={(e) => updateListItem(field.key, idx, itemField.key, e.target.value)}
                                  rows={2}
                                  className="text-sm"
                                />
                              ) : itemField.type === "image" ? (
                                renderImageField(
                                  `${field.key}-${idx}-${itemField.key}`,
                                  (item[itemField.key] as string) || "",
                                  (v) => updateListItem(field.key, idx, itemField.key, v),
                                  true,
                                )
                              ) : (
                                <Input
                                  value={(item[itemField.key] as string) || ""}
                                  onChange={(e) => updateListItem(field.key, idx, itemField.key, e.target.value)}
                                  className="text-sm"
                                />
                              )}
                            </div>
                          ))}
                        </div>
                      ))}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="w-full border-dashed"
                        onClick={() => addListItem(field.key, field.itemFields)}
                      >
                        <Plus className="size-3.5 mr-1" />
                        Add item
                      </Button>
                    </div>
                  );
                }

                return null;
              })}
            </div>

            <div className="sticky bottom-0 bg-white border-t px-6 py-4 flex justify-end gap-2 rounded-b-xl">
              <Button type="button" variant="outline" onClick={cancel}>
                Cancel
              </Button>
              <Button type="button" onClick={save} disabled={saving}>
                {saving ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
