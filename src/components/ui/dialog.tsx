"use client";
import * as Primitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <Primitive.Root open={open} onOpenChange={onOpenChange}>
      <Primitive.Portal>
        <Primitive.Overlay className="dialog-overlay" />
        <Primitive.Content className="dialog-content">
          <div className="dialog-head">
            <Primitive.Title>{title}</Primitive.Title>
            <Primitive.Close
              className="button button-ghost button-icon"
              aria-label="關閉"
            >
              <X size={20} />
            </Primitive.Close>
          </div>
          <Primitive.Description className="muted">
            {description || "請確認欄位內容後送出。"}
          </Primitive.Description>
          {children}
        </Primitive.Content>
      </Primitive.Portal>
    </Primitive.Root>
  );
}
