import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { MailAttachment, MailTemplate, Recipient, SentMailRecord } from "../domain/mailer";

interface MailerState {
  recipients: Recipient[];
  templates: MailTemplate[];
  sentMail: SentMailRecord[];
  addRecipients: (recipients: Recipient[]) => number;
  removeRecipient: (id: string) => void;
  addSentMail: (record: SentMailRecord) => void;
  addTemplate: (
    template: Omit<MailTemplate, "id" | "updatedAt" | "attachments"> & {
      attachments?: MailAttachment[];
    },
  ) => string;
  updateTemplate: (template: MailTemplate) => void;
  removeTemplate: (id: string) => void;
}

const MAX_STORED_SENT_MAIL = 5_000;
const PERSISTENCE_KEY = "timeless-mailer";
const LEGACY_PERSISTENCE_KEY = "postbird-mailer";
const storage = createJSONStorage(() => ({
  getItem: (name: string) =>
    localStorage.getItem(name)
    ?? (name === PERSISTENCE_KEY ? localStorage.getItem(LEGACY_PERSISTENCE_KEY) : null),
  setItem: (name: string, value: string) => localStorage.setItem(name, value),
  removeItem: (name: string) => localStorage.removeItem(name),
}));

const initialTemplates: MailTemplate[] = [
  {
    id: "welcome-note",
    name: "A quick hello",
    subject: "A quick hello, {{name}}",
    body: "Hi {{name}},\n\nI wanted to reach out and introduce myself. Let me know if there's a good time to connect.\n\nBest,\nYour name",
    attachments: [],
    updatedAt: Date.now(),
  },
  {
    id: "product-update",
    name: "Product update",
    subject: "A few updates for you",
    body: "Hi {{name}},\n\nHere are a few things we've been working on that I thought you'd find useful.\n\nWould you like me to share more details?\n\nBest,\nYour name",
    attachments: [],
    updatedAt: Date.now(),
  },
];

export const useMailerStore = create<MailerState>()(
  persist(
    (set, get) => ({
      recipients: [],
      templates: initialTemplates,
      sentMail: [],
      addRecipients: (incoming) => {
        const existing = get().recipients;
        const knownEmails = new Set(existing.map(({ email }) => email.toLowerCase()));
        const accepted: Recipient[] = [];

        for (const recipient of incoming) {
          const normalizedEmail = recipient.email.toLowerCase();
          if (knownEmails.has(normalizedEmail) || existing.length + accepted.length >= 100) {
            continue;
          }
          knownEmails.add(normalizedEmail);
          accepted.push(recipient);
        }

        set({ recipients: [...existing, ...accepted] });
        return accepted.length;
      },
      removeRecipient: (id) =>
        set((state) => ({
          recipients: state.recipients.filter((recipient) => recipient.id !== id),
        })),
      addSentMail: (record) =>
        set((state) => ({
          sentMail: [record, ...state.sentMail].slice(0, MAX_STORED_SENT_MAIL),
        })),
      addTemplate: (template) => {
        const id = crypto.randomUUID();
        set((state) => ({
          templates: [
            ...state.templates,
            { ...template, attachments: template.attachments ?? [], id, updatedAt: Date.now() },
          ],
        }));
        return id;
      },
      updateTemplate: (template) =>
        set((state) => ({
          templates: state.templates.map((current) =>
            current.id === template.id ? { ...template, updatedAt: Date.now() } : current,
          ),
        })),
      removeTemplate: (id) =>
        set((state) => ({
          templates: state.templates.filter((template) => template.id !== id),
        })),
    }),
    {
      name: PERSISTENCE_KEY,
      storage,
      partialize: ({ recipients, templates, sentMail }) => ({ recipients, templates, sentMail }),
      merge: (persistedState, currentState) => {
        const persisted = persistedState as Partial<MailerState>;
        return {
          ...currentState,
          recipients: persisted.recipients ?? currentState.recipients,
          sentMail: persisted.sentMail ?? currentState.sentMail,
          templates: (persisted.templates ?? currentState.templates).map((template) => ({
            ...template,
            attachments: template.attachments ?? [],
          })),
        };
      },
    },
  ),
);
