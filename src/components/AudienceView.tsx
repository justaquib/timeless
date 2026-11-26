import { useRef, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { ArrowDownToLine, Plus, Search, Trash2, Users } from "lucide-react";
import { toast } from "react-toastify";
import { z } from "zod";
import { parseRecipientFile } from "../domain/mailer";
import { useMailerStore } from "../store/mailerStore";

export function AudienceView() {
  const recipients = useMailerStore((state) => state.recipients);
  const addRecipients = useMailerStore((state) => state.addRecipients);
  const removeRecipient = useMailerStore((state) => state.removeRecipient);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [search, setSearch] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const visibleRecipients = recipients.filter((recipient) =>
    `${recipient.name} ${recipient.email}`.toLowerCase().includes(search.toLowerCase()),
  );

  const handleAdd = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();
    if (!z.email().safeParse(normalizedEmail).success) {
      toast.error("Enter a valid email address.");
      return;
    }
    const added = addRecipients([{ id: crypto.randomUUID(), name: name.trim(), email: normalizedEmail }]);
    if (added) {
      toast.success("Contact added.");
      setName("");
      setEmail("");
    } else {
      toast.info(recipients.length >= 100 ? "Your list is limited to 100 contacts." : "That email is already on your list.");
    }
  };

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const parsed = parseRecipientFile(await file.text());
      const added = addRecipients(parsed);
      if (added === 0) {
        toast.info(parsed.length ? "No new contacts added. They may already be on your list or the 100-contact limit is full." : "No email addresses found in that file.");
      } else {
        const skipped = parsed.length - added;
        toast.success(`Added ${added} contact${added === 1 ? "" : "s"}${skipped ? `; skipped ${skipped} duplicate or over-limit entries` : ""}.`);
      }
    } catch (error) {
      toast.error(`Could not read the contact file: ${String(error)}`);
    } finally {
      event.target.value = "";
    }
  };

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-slate-900">Client list</p>
            <p className="mt-1 text-xs text-slate-500">Add contacts individually or import a CSV / text file.</p>
          </div>
          <div className="rounded-xl bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-700">{recipients.length} / 100 contacts</div>
        </div>
        <div className="mt-5 grid gap-3 rounded-2xl bg-slate-50 p-4 lg:grid-cols-[1fr_1.2fr_auto]">
          <form className="contents" onSubmit={handleAdd}>
            <input
              className="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
              onChange={(event) => setName(event.target.value)}
              placeholder="Contact name"
              value={name}
            />
            <input
              className="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
              onChange={(event) => setEmail(event.target.value)}
              placeholder="email@example.com"
              type="email"
              value={email}
            />
            <button className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700" type="submit"><Plus size={16} /> Add</button>
          </form>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <p className="text-[11px] text-slate-400">CSV columns can be name and email. Maximum 100 unique addresses.</p>
          <input accept=".csv,.txt,text/csv,text/plain" className="hidden" onChange={handleFile} ref={fileInput} type="file" />
          <button
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-600 hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700"
            onClick={() => fileInput.current?.click()}
            type="button"
          >
            <ArrowDownToLine size={15} /> Import contacts
          </button>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            <p className="text-sm font-semibold text-slate-900">Contacts</p>
            <p className="mt-1 text-xs text-slate-500">These addresses are never exposed to other recipients.</p>
          </div>
          <label className="relative block">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
            <input className="w-52 rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-xs outline-none focus:border-indigo-400" onChange={(event) => setSearch(event.target.value)} placeholder="Search contacts" value={search} />
          </label>
        </div>
        {visibleRecipients.length ? (
          <div className="divide-y divide-slate-100">
            {visibleRecipients.map((recipient, index) => (
              <div className="flex items-center gap-3 px-5 py-3" key={recipient.id}>
                <div className={`flex size-9 items-center justify-center rounded-full text-xs font-bold ${index % 2 ? "bg-rose-100 text-rose-700" : "bg-sky-100 text-sky-700"}`}>{(recipient.name || recipient.email).slice(0, 1).toUpperCase()}</div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-slate-800">{recipient.name || "—"}</p>
                  <p className="truncate text-xs text-slate-500">{recipient.email}</p>
                </div>
                <span className="hidden rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold text-emerald-600 sm:inline">Ready</span>
                <button aria-label={`Remove ${recipient.email}`} className="rounded-lg p-2 text-slate-300 hover:bg-rose-50 hover:text-rose-500" onClick={() => removeRecipient(recipient.id)} type="button"><Trash2 size={15} /></button>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center px-6 py-14 text-center">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-slate-50 text-slate-400"><Users size={21} /></div>
            <p className="mt-3 text-sm font-semibold text-slate-800">{recipients.length ? "No matching contacts" : "Your contact list is empty"}</p>
            <p className="mt-1 max-w-sm text-xs leading-5 text-slate-500">Add a contact above or import a CSV file. You can send to up to 100 clients in one sequence.</p>
          </div>
        )}
      </section>
    </div>
  );
}

