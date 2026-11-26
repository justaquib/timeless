import { useCallback, useEffect, useState } from "react";
import { useMailerStore } from "../store/mailerStore";

export function useRecipientSelection() {
  const audience = useMailerStore((state) => state.recipients);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const recipients = audience.filter((recipient) => selectedIds.includes(recipient.id));

  useEffect(() => {
    const audienceIds = new Set(audience.map((recipient) => recipient.id));
    setSelectedIds((current) => current.filter((id) => audienceIds.has(id)));
  }, [audience]);

  const toggleRecipient = useCallback((id: string) => {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((selectedId) => selectedId !== id) : [...current, id],
    );
  }, []);

  const removeRecipient = useCallback((id: string) => {
    setSelectedIds((current) => current.filter((selectedId) => selectedId !== id));
  }, []);

  const openPicker = useCallback(() => setPickerOpen(true), []);
  const closePicker = useCallback(() => setPickerOpen(false), []);
  const clearSelection = useCallback(() => setSelectedIds([]), []);

  return {
    audience,
    recipients,
    selectedIds,
    pickerOpen,
    openPicker,
    closePicker,
    toggleRecipient,
    removeRecipient,
    clearSelection,
  };
}
