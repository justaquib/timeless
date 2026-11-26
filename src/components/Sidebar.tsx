import { Activity, ChevronDown, FileText, Gauge, Inbox, MoreHorizontal, Send, Settings, Sparkles, Users } from "lucide-react";
import type { Section } from "../domain/mailer";
import { useMailerStore } from "../store/mailerStore";

const navItems: { id: Section; label: string; icon: typeof Send }[] = [
  { id: "dashboard", label: "Dashboard", icon: Gauge },
  { id: "compose", label: "Compose", icon: Send },
  { id: "templates", label: "Templates", icon: FileText },
  { id: "audience", label: "Audience", icon: Users },
  { id: "activity", label: "Sent", icon: Activity },
];

export function Sidebar({
  activeSection,
  onNavigate,
  onOpenSettings,
  connected,
}: {
  activeSection: Section;
  onNavigate: (section: Section) => void;
  onOpenSettings: () => void;
  connected: boolean;
}) {
  const recipients = useMailerStore((state) => state.recipients);
  const templates = useMailerStore((state) => state.templates);
  const sentMail = useMailerStore((state) => state.sentMail);
  return (
    <aside className="fixed inset-y-0 left-0 z-20 flex w-[248px] flex-col border-r border-slate-200 bg-white px-4 py-5">
      <div className="flex items-center gap-3 px-2">
        <div className="flex size-10 items-center justify-center rounded-2xl bg-indigo-600 text-white shadow-lg shadow-indigo-200">
          <Send size={19} />
        </div>
        <div>
          <p className="text-[15px] font-bold tracking-tight text-slate-900">Timeless</p>
          <p className="text-[11px] font-medium text-slate-400">MAIL WORKSPACE</p>
        </div>
        <button aria-label="More options" className="ml-auto rounded-lg p-1.5 text-slate-400 hover:bg-slate-100">
          <MoreHorizontal size={18} />
        </button>
      </div>

      <div className="mt-8 rounded-2xl bg-slate-50 p-3">
        <div className="flex items-center gap-2.5">
          <div className="flex size-9 items-center justify-center rounded-xl bg-white text-indigo-600 shadow-sm">
            <Inbox size={17} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold text-slate-800">Personal workspace</p>
            <p className="mt-0.5 text-[11px] text-slate-500">Private mail desk</p>
          </div>
          <ChevronDown size={15} className="text-slate-400" />
        </div>
      </div>

      <p className="mb-2 mt-8 px-3 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Workspace</p>
      <nav className="space-y-1">
        {navItems.map(({ id, label, icon: Icon }) => {
          const active = activeSection === id;
          const count =
            id === "audience"
              ? recipients.length
              : id === "templates"
                ? templates.length
                : id === "activity"
                  ? sentMail.length
                  : undefined;
          return (
            <button
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[13px] font-medium transition ${
                active ? "bg-indigo-50 text-indigo-700" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              }`}
              key={id}
              onClick={() => onNavigate(id)}
              type="button"
            >
              <Icon size={17} strokeWidth={active ? 2.2 : 1.8} />
              <span className="flex-1">{label}</span>
              {count !== undefined && <span className={`text-xs ${active ? "text-indigo-500" : "text-slate-400"}`}>{count}</span>}
            </button>
          );
        })}
      </nav>

      <div className="mt-8 border-t border-slate-100 pt-6">
        <div className="mb-3 flex items-center justify-between px-3">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Mail account</p>
          <span className={`size-2 rounded-full ${connected ? "bg-emerald-500" : "bg-slate-300"}`} />
        </div>
        <button
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[13px] font-medium text-slate-600 hover:bg-slate-50"
          onClick={onOpenSettings}
          type="button"
        >
          <Settings size={17} />
          <span className="flex-1">Mail settings</span>
          <span className="text-[10px] text-slate-400">{connected ? "Ready" : "Setup"}</span>
        </button>
      </div>

      <div className="mt-auto">
        <div className="mb-4 rounded-2xl border border-indigo-100 bg-indigo-50/70 p-3.5">
          <div className="flex items-center gap-2 text-indigo-700">
            <Sparkles size={15} />
            <span className="text-xs font-semibold">Thoughtful outreach</span>
          </div>
          <p className="mt-1.5 text-[11px] leading-5 text-slate-500">Each message is sent individually, with a personal touch.</p>
        </div>
        <div className="flex items-center gap-3 border-t border-slate-100 px-2 pt-4">
          <div className="flex size-9 items-center justify-center rounded-full bg-amber-100 text-xs font-bold text-amber-700">JD</div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold text-slate-800">Your workspace</p>
            <p className="truncate text-[11px] text-slate-400">Private desktop app</p>
          </div>
          <MoreHorizontal size={17} className="text-slate-400" />
        </div>
      </div>
    </aside>
  );
}

