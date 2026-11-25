"use client";

import { SectionEditor, type FieldSchema } from "@/components/section-editor";

export function EditableSection({
  isSuperAdmin,
  sectionKey,
  fields,
  content,
  children,
}: {
  isSuperAdmin: boolean;
  sectionKey: string;
  fields: FieldSchema[];
  content: Record<string, unknown>;
  children: React.ReactNode;
}) {
  if (!isSuperAdmin) {
    return <>{children}</>;
  }

  return (
    <SectionEditor sectionKey={sectionKey} fields={fields} content={content}>
      {children}
    </SectionEditor>
  );
}
