import { useEffect, useMemo, useState } from "react";
import { Check, Search, Users, X } from "lucide-react";
import type { Recipient } from "../domain/mailer";

export function RecipientPickerModal({
  open,
  audience,
  selectedIds,
  disabled,
  onClose,
  onToggleRecipient,
  onClearSelection,
  onManageContacts,
}: {
  open: boolean;
  audience: Recipient[];
  selectedIds: string[];
  disabled: boolean;
  onClose: () => void;
  onToggleRecipient: (id: string) => void;
  onClearSelection: () => void;
  onManageContacts: () => void;
}) {
  const [search, setSearch] = useState("");
  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);
  const filteredAudience = useMemo(() => {
    const query = search.trim().toLowerCase();
    return audience.filter((recipient) =>
      `${recipient.name} ${recipient.email}`.toLowerCase().includes(query),
    );
  }, [audience, search]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-slate-950/50 p-0 sm:items-center sm:p-5">
      <section
        aria-labelledby="recipient-picker-title"
        aria-modal="true"
        className="flex h-full w-full max-w-5xl flex-col bg-white shadow-2xl sm:h-[90vh] sm:max-h-[760px] sm:rounded-2xl"
        role="dialog"
      >
        <header className="flex items-start justify-between border-b border-slate-100 px-5 py-5 sm:px-7">
          <div>
            <h2 className="text-lg font-semibold text-slate-900" id="recipient-picker-title">
              Choose recipients
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Select only the contacts you want to receive this email.
            </p>
          </div>
          <button
            aria-label="Close recipient picker"
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            onClick={onClose}
            type="button"
          >
            <X size={18} />
          </button>
        </header>

        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-5 py-4 sm:px-7">
          <label className="relative min-w-48 flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              aria-label="Search audience contacts"
              autoFocus
              className="w-full rounded-xl border border-slate-200 py-2.5 pl-10 pr-3 text-sm outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by name or email"
              type="search"
              value={search}
            />
          </label>
          <span className="rounded-full bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-700">
            {selected.size} selected
          </span>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-2 sm:px-7">
          {audience.length === 0 ? (
            <div className="flex h-full min-h-64 flex-col items-center justify-center text-center">
              <div className="flex size-12 items-center justify-center rounded-2xl bg-slate-50 text-slate-400">
                <Users size={21} />
              </div>
              <p className="mt-3 text-sm font-semibold text-slate-800">Your audience is empty</p>
              <p className="mt-1 max-w-sm text-xs leading-5 text-slate-500">
                Add contacts or import a list first. Contacts will not be selected automatically.
              </p>
              <button
                className="mt-4 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700"
                onClick={onManageContacts}
                type="button"
              >
                Manage contacts
              </button>
            </div>
          ) : filteredAudience.length ? (
            <ul className="divide-y divide-slate-100">
              {filteredAudience.map((recipient, index) => {
                const isSelected = selected.has(recipient.id);
                return (
                  <li key={recipient.id}>
                    <label className="flex cursor-pointer items-center gap-3 py-3.5 hover:bg-slate-50/80">
                      <input
                        checked={isSelected}
                        className="size-4 accent-indigo-600"
                        disabled={disabled}
                        onChange={() => onToggleRecipient(recipient.id)}
                        type="checkbox"
                      />
                      <span className={`flex size-10 shrink-0 items-center justify-center rounded-full text-xs font-bold ${index % 2 ? "bg-rose-100 text-rose-700" : "bg-sky-100 text-sky-700"}`}>
                        {(recipient.name || recipient.email).slice(0, 1).toUpperCase()}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-slate-800">
                          {recipient.name || recipient.email}
                        </span>
                        {recipient.name && (
                          <span className="mt-0.5 block truncate text-xs text-slate-500">
                            {recipient.email}
                          </span>
                        )}
                      </span>
                      <span className={`inline-flex items-center gap-1 text-xs font-medium ${isSelected ? "text-indigo-700" : "text-slate-400"}`}>
                        {isSelected && <Check size={14} />}
                        {isSelected ? "Selected" : "Add"}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="flex h-full min-h-64 flex-col items-center justify-center text-center">
              <p className="text-sm font-semibold text-slate-800">No contacts found</p>
              <p className="mt-1 text-xs text-slate-500">Try another name or email address.</p>
            </div>
          )}
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-5 py-4 sm:px-7">
          <button
            className="rounded-lg px-2 py-2 text-sm font-medium text-slate-500 hover:bg-slate-100 disabled:opacity-40"
            disabled={disabled || selected.size === 0}
            onClick={onClearSelection}
            type="button"
          >
            Clear selection
          </button>
          <div className="flex items-center gap-2">
            {audience.length > 0 && (
              <button
                className="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100"
                onClick={onManageContacts}
                type="button"
              >
                Manage contacts
              </button>
            )}
            <button
              className="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700"
              onClick={onClose}
              type="button"
            >
              Done
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}
