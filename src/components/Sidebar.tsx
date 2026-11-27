import { Activity, ChevronDown, FileText, Gauge, Inbox, ListTodo, MoreHorizontal, Search, Send, Settings, SlidersHorizontal, Users } from "lucide-react";
import type { Section } from "../domain/workspace";
import { useMailerStore } from "../store/mailerStore";

const navItems: { id: Section; label: string; icon: typeof Send }[] = [
  { id: "dashboard", label: "Dashboard", icon: Gauge },
  { id: "compose", label: "Compose", icon: Send },
  { id: "templates", label: "Templates", icon: FileText },
  { id: "audience", label: "Audience", icon: Users },
  { id: "activity", label: "Sent", icon: Activity },
  { id: "tasks", label: "Tasks", icon: ListTodo },
  { id: "scraper", label: "Web scraper", icon: Search },
  { id: "preferences", label: "Preferences", icon: SlidersHorizontal },
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
    <aside className="fixed inset-y-0 left-0 z-20 flex w-[220px] flex-col overflow-y-auto border-r border-t border-slate-200 bg-white px-3.5 py-4">
      <div className="flex items-center gap-3 px-2">
        <div className="flex size-9 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-sm">
          <Send size={17} />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-bold tracking-tight text-slate-900">Timeless</p>
          <p className="whitespace-nowrap text-[9px] font-medium tracking-wide text-slate-400">PERSONAL WORKSPACE</p>
        </div>
        <button aria-label="More options" className="ml-auto rounded-lg p-1.5 text-slate-400 hover:bg-slate-100">
          <MoreHorizontal size={18} />
        </button>
      </div>

      <div className="mt-6 rounded-xl bg-slate-50 p-2.5">
        <div className="flex items-center gap-2.5">
          <div className="flex size-9 items-center justify-center rounded-xl bg-white text-indigo-600 shadow-sm">
            <Inbox size={17} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold text-slate-800">Personal workspace</p>
            <p className="mt-0.5 text-[11px] text-slate-500">Your personal space</p>
          </div>
          <ChevronDown size={15} className="text-slate-400" />
        </div>
      </div>

      <p className="mb-2 mt-6 px-3 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Workspace</p>
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
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-xs font-medium transition ${
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

      <div className="mt-auto">
        {/* <div className="mb-3 rounded-xl border border-indigo-100 bg-indigo-50/70 p-3">
          <div className="flex items-center gap-2 text-indigo-700">
            <Sparkles size={15} />
            <span className="text-xs font-semibold">Make room for what matters</span>
          </div>
          <p className="mt-1.5 text-[11px] leading-5 text-slate-500">Messages, contacts, and research in one calm workspace.</p>
        </div> */} 
        <div className="mt-6 border-t border-slate-100 pt-4">
          <div className="mb-3 flex items-center justify-between px-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Mail account</p>
            <span className={`size-2 rounded-full ${connected ? "bg-emerald-500" : "bg-slate-300"}`} />
          </div>
          <button
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-xs font-medium text-slate-600 hover:bg-slate-50"
            onClick={onOpenSettings}
            type="button"
          >
            <Settings size={17} />
            <span className="flex-1">Mail settings</span>
            <span className="text-[10px] text-slate-400">{connected ? "Ready" : "Setup"}</span>
          </button>
        </div>
        <div className="flex items-center gap-3 border-t border-slate-100 px-2 pt-3">
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

