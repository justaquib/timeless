import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { isTauri } from "@tauri-apps/api/core";
import { ArrowLeft, LogOut, Settings, ShieldCheck } from "lucide-react";
import { toast } from "react-toastify";
import { useMailerStore } from "./store/mailerStore";
import { countSuccessfulSends, parseEmailAddressList } from "./domain/mailer";
import type { EmailCopyRecipients, Section, SentPeriod } from "./domain/mailer";
import { ActivityView } from "./components/ActivityView";
import { AudienceView } from "./components/AudienceView";
import { ComposeView } from "./components/ComposeView";
import { ConfirmSendModal } from "./components/ConfirmSendModal";
import { DashboardView } from "./components/DashboardView";
import { GmailLoginScreen } from "./components/GmailLoginScreen";
import { SettingsModal } from "./components/SettingsModal";
import { Sidebar } from "./components/Sidebar";
import { SplashScreen } from "./components/SplashScreen";
import { TemplatesView } from "./components/TemplatesView";
import { RecipientPickerModal } from "./components/RecipientPickerModal";
import { useGmailAuth } from "./hooks/useGmailAuth";
import { useGmailReplyCount } from "./hooks/useGmailReplyCount";
import { sentMailHistoryQueryKey, useSentMailHistory } from "./hooks/useSentMailHistory";
import { useSendQueue } from "./hooks/useSendQueue";
import { useGmailSendQuota, useSmtpSettings } from "./hooks/useSmtpSettings";
import { useRecipientSelection } from "./hooks/useRecipientSelection";

function WorkspaceApp({
  gmailAccount,
  onSignOut,
  onConnectGmail,
}: {
  gmailAccount?: string;
  onSignOut: () => void;
  onConnectGmail: () => void;
}) {
  const [draftCc, setDraftCc] = useState("");
  const [draftBcc, setDraftBcc] = useState("");
  const [copyRecipients, setCopyRecipients] = useState<EmailCopyRecipients>({
    ccEmails: [],
    bccEmails: [],
  });
  const [sentPeriod, setSentPeriod] = useState<SentPeriod>("today");
  const [activeSection, setActiveSection] = useState<Section>("dashboard");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState(
    () => useMailerStore.getState().templates[0]?.id ?? "",
  );
  const [draftSubject, setDraftSubject] = useState(
    () => useMailerStore.getState().templates[0]?.subject ?? "",
  );
  const [draftBody, setDraftBody] = useState(
    () => useMailerStore.getState().templates[0]?.body ?? "",
  );
  const { queue, sending, send, stop } = useSendQueue();
  const templates = useMailerStore((state) => state.templates);
  const addTemplate = useMailerStore((state) => state.addTemplate);
  const updateTemplate = useMailerStore((state) => state.updateTemplate);
  const { data: smtpSettings } = useSmtpSettings();
  const { sentMail, canRecover, recovering, recover } = useSentMailHistory(gmailAccount, smtpSettings);
  const gmailAccountEmail =
    smtpSettings?.host.trim().toLowerCase() === "smtp.gmail.com"
      ? smtpSettings.username
      : undefined;
  const { data: gmailSendQuota, resetInSeconds: gmailResetInSeconds } = useGmailSendQuota(gmailAccountEmail);
  const gmailReplies = useGmailReplyCount(
    gmailAccount,
    sentMail,
    activeSection === "dashboard",
  );
  const queryClient = useQueryClient();
  const { audience, recipients, selectedIds, pickerOpen, openPicker, closePicker,
    toggleRecipient, removeRecipient, clearSelection } = useRecipientSelection();
  const selectedTemplate = templates.find((template) => template.id === selectedTemplateId);
  const deliveryRecipientCount = (copies: EmailCopyRecipients) =>
    recipients.length * (1 + copies.ccEmails.length + copies.bccEmails.length);

  useEffect(() => {
    if (!templates.length) {
      setSelectedTemplateId("");
      setDraftSubject("");
      setDraftBody("");
      return;
    }
    if (selectedTemplateId && !templates.some((template) => template.id === selectedTemplateId)) {
      const firstTemplate = templates[0];
      setSelectedTemplateId(firstTemplate.id);
      setDraftSubject(firstTemplate.subject);
      setDraftBody(firstTemplate.body);
    }
  }, [templates, selectedTemplateId]);

  const selectTemplate = (id: string) => {
    setSelectedTemplateId(id);
    const template = templates.find((item) => item.id === id);
    setDraftSubject(template?.subject ?? "");
    setDraftBody(template?.body ?? "");
  };

  const beginSending = async () => {
    setConfirmOpen(false);
    if (!smtpSettings) {
      toast.error("Configure your SMTP account before sending.");
      setSettingsOpen(true);
      return;
    }
    if (!canStartGmailSequence(deliveryRecipientCount(copyRecipients))) return;
    try {
      const result = await send({
        recipients,
        ccEmails: copyRecipients.ccEmails,
        bccEmails: copyRecipients.bccEmails,
        subject: draftSubject,
        body: draftBody,
        attachments: selectedTemplate?.attachments ?? [],
        fromEmail: smtpSettings.fromEmail,
      });
      const summary = `${result.sent} sent${result.failed ? `, ${result.failed} failed` : ""}${result.stopped ? ", sequence stopped" : ""}.`;
      if (result.failed || result.historySaveErrors.length) {
        const historyWarning = result.historySaveErrors.length
          ? ` ${result.historySaveErrors.length} sent message(s) could not be saved to local history: ${result.historySaveErrors[0]}`
          : "";
        toast.warning(`${summary}${historyWarning}`);
      }
      else toast.success(summary);
    } catch (error) {
      toast.error(String(error));
    } finally {
      if (gmailAccountEmail) {
        void queryClient.invalidateQueries({
          queryKey: ["gmail-send-quota", gmailAccountEmail],
        });
      }
      if (gmailAccount) {
        void queryClient.invalidateQueries({
          queryKey: ["gmail-reply-count", gmailAccount],
        });
      }
      if (isTauri()) {
        void queryClient.invalidateQueries({ queryKey: sentMailHistoryQueryKey });
      }
    }
  };

  const canStartGmailSequence = (recipientCount: number) => {
    if (!gmailSendQuota) return true;
    if (gmailSendQuota.nextSendInSeconds > 0) {
      toast.error(`Wait ${gmailSendQuota.nextSendInSeconds} seconds before the next Gmail send.`);
      return false;
    }
    if (recipientCount > gmailSendQuota.remaining) {
      toast.error(
        `This sequence requires ${recipientCount} recipient deliveries, but only ${gmailSendQuota.remaining} Gmail safety-limit recipients remain.`,
      );
      return false;
    }
    return true;
  };

  const requestSend = () => {
    if (!smtpSettings) {
      toast.info("Connect an SMTP account to send your email.");
      setSettingsOpen(true);
      return;
    }
    try {
      const nextCopyRecipients = {
        ccEmails: parseEmailAddressList(draftCc, "CC"),
        bccEmails: parseEmailAddressList(draftBcc, "BCC"),
      };
      if (canStartGmailSequence(deliveryRecipientCount(nextCopyRecipients))) {
        setCopyRecipients(nextCopyRecipients);
        setConfirmOpen(true);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  const stopSending = () => {
    stop();
    toast.info("The sequence will stop after the current email.");
  };

  const saveFromCompose = () => {
    if (!draftSubject.trim() || !draftBody.trim()) {
      toast.error("Add a subject and message before saving a template.");
      return;
    }
    if (selectedTemplate) {
      updateTemplate({ ...selectedTemplate, subject: draftSubject, body: draftBody });
      toast.success("Template updated.");
      return;
    }
    const id = addTemplate({ name: "New email", subject: draftSubject, body: draftBody });
    setSelectedTemplateId(id);
    toast.success("Template saved.");
  };

  const pageTitle: Record<Section, { title: string; description: string }> = {
    dashboard: { title: "Dashboard", description: "A quick view of your outreach and replies." },
    compose: { title: "Compose email", description: "Create a personal note for your client list." },
    templates: { title: "Email templates", description: "Write once, personalize every message." },
    audience: { title: "Your audience", description: "Manage the people you want to reach." },
    activity: { title: "Sent emails", description: "Keep track of each individual delivery." },
  };
  const sentCount = countSuccessfulSends(sentMail, sentPeriod);

  return (
    <div className="min-h-screen bg-[#f5f6fa] text-slate-800">
      <Sidebar
        activeSection={activeSection}
        connected={Boolean(smtpSettings)}
        onNavigate={setActiveSection}
        onOpenSettings={() => {
          if (!sending) setSettingsOpen(true);
        }}
      />
      <div className="ml-[248px] min-h-screen min-w-0">
        <header className="sticky top-0 z-10 flex min-h-[76px] items-center justify-between border-b border-slate-200/80 bg-white/90 px-6 backdrop-blur-xl sm:px-8">
          <div className="flex items-center gap-3">
            <button aria-label="Back" className="hidden rounded-lg p-2 text-slate-400 hover:bg-slate-100 lg:block"><ArrowLeft size={17} /></button>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">Personal workspace <span className="px-1">/</span> {pageTitle[activeSection].title}</p>
              <p className="mt-1 text-sm font-semibold text-slate-800">{activeSection === "compose" ? "New message" : pageTitle[activeSection].title}</p>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <div className={`hidden items-center gap-2 rounded-full px-3 py-1.5 text-[11px] font-medium sm:flex ${smtpSettings ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
              <span className={`size-1.5 rounded-full ${smtpSettings ? "bg-emerald-500" : "bg-slate-400"}`} />
              {smtpSettings ? smtpSettings.fromEmail : "Mail not connected"}
            </div>
            {gmailAccount ? (
              <>
                <span className="hidden max-w-48 truncate text-xs text-slate-500 xl:block">
                  Gmail · {gmailAccount}
                </span>
                <button
                  aria-label="Sign out of Gmail"
                  className="flex size-9 items-center justify-center rounded-full bg-violet-100 text-violet-700 hover:bg-violet-200"
                  onClick={onSignOut}
                  title="Sign out of Gmail"
                  type="button"
                >
                  <LogOut size={15} />
                </button>
              </>
            ) : isTauri() ? (
              <button
                className="rounded-full bg-violet-100 px-3 py-2 text-[11px] font-semibold text-violet-700 hover:bg-violet-200"
                onClick={onConnectGmail}
                type="button"
              >
                Connect Gmail
              </button>
            ) : null}
          </div>
        </header>

        <main className="mx-auto max-w-[1500px] px-5 py-7 sm:px-8 lg:px-10">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{pageTitle[activeSection].title}</h1>
              <p className="mt-1.5 text-sm text-slate-500">{pageTitle[activeSection].description}</p>
            </div>
            {activeSection === "compose" && (
              <button
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-600 shadow-sm hover:border-indigo-200 hover:text-indigo-700"
                disabled={sending}
                onClick={() => setSettingsOpen(true)}
                type="button"
              >
                <Settings size={15} /> {smtpSettings ? "Mail settings" : "Connect mail"}
              </button>
            )}
          </div>

          {activeSection === "dashboard" && (
            <DashboardView
              gmailAccount={gmailAccount}
              onCompose={() => setActiveSection("compose")}
              onRefreshReplies={() => void gmailReplies.refetch()}
              onSentPeriodChange={setSentPeriod}
              onViewSent={() => setActiveSection("activity")}
              recentSent={sentMail}
              replyCount={gmailAccount ? gmailReplies.data ?? 0 : null}
              replyError={gmailReplies.error ? String(gmailReplies.error) : null}
              repliesLoading={Boolean(gmailAccount && gmailReplies.isFetching)}
              sentCount={sentCount}
              sentPeriod={sentPeriod}
            />
          )}
          {activeSection === "compose" && (
            <ComposeView
              audienceCount={audience.length}
              bcc={draftBcc}
              body={draftBody}
              cc={draftCc}
              onOpenRecipientPicker={openPicker}
              onRemoveRecipient={removeRecipient}
              onGoToAudience={() => setActiveSection("audience")}
              onGoToTemplates={() => setActiveSection("templates")}
              onRequestSend={requestSend}
              onSaveDraft={saveFromCompose}
              onStop={stopSending}
              queue={queue}
              attachments={selectedTemplate?.attachments ?? []}
              recipients={recipients}
              setBcc={setDraftBcc}
              selectedTemplateId={selectedTemplateId}
              setCc={setDraftCc}
              sending={sending}
              setBody={setDraftBody}
              setSelectedTemplateId={selectTemplate}
              setSubject={setDraftSubject}
              smtpSettings={smtpSettings}
              gmailQuota={gmailSendQuota && { ...gmailSendQuota, resetInSeconds: gmailResetInSeconds }}
              subject={draftSubject}
              templates={templates}
            />
          )}
          {activeSection === "templates" && (
            <TemplatesView
              selectedTemplateId={selectedTemplateId}
              setSelectedTemplateId={selectTemplate}
              templates={templates}
            />
          )}
          {activeSection === "audience" && <AudienceView />}
          {activeSection === "activity" && (
            <ActivityView
              canRecoverGmailSent={canRecover}
              failedQueue={queue.filter((item) => item.status === "failed")}
              onRecoverGmailSent={recover}
              recoveringGmailSent={recovering}
              sentMail={sentMail}
            />
          )}

          <footer className="mt-8 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200/80 pt-4 text-[11px] text-slate-400">
            <span>Timeless · Your mail stays yours</span>
            <span className="inline-flex items-center gap-1.5"><ShieldCheck size={13} /> Credentials kept in your system keychain</span>
          </footer>
        </main>
      </div>

      <SettingsModal
        currentSettings={smtpSettings}
        onClose={() => setSettingsOpen(false)}
        open={settingsOpen && !sending}
      />
      <RecipientPickerModal
        audience={audience} disabled={sending} onClearSelection={clearSelection}
        onClose={closePicker} onManageContacts={() => { closePicker(); setActiveSection("audience"); }}
        onToggleRecipient={toggleRecipient} open={pickerOpen} selectedIds={selectedIds}
      />
      <ConfirmSendModal
        bccCount={copyRecipients.bccEmails.length}
        ccCount={copyRecipients.ccEmails.length}
        count={recipients.length}
        gmailQuota={gmailSendQuota}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => void beginSending()}
        open={confirmOpen}
      />
    </div>
  );
}

export function App() {
  const [splashComplete, setSplashComplete] = useState(false);
  const [offlineMode, setOfflineMode] = useState(false);
  const gmailAuth = useGmailAuth();

  if (!splashComplete) {
    return <SplashScreen onComplete={() => setSplashComplete(true)} />;
  }

  if (isTauri() && !gmailAuth.account && !offlineMode) {
    return (
      <GmailLoginScreen
        error={gmailAuth.signInError}
        loading={gmailAuth.isLoading}
        loadError={gmailAuth.loadError}
        onContinueWithoutGmail={() => setOfflineMode(true)}
        onSignIn={() => void gmailAuth.signIn()}
        signingIn={gmailAuth.signingIn}
      />
    );
  }

  return (
    <WorkspaceApp
      gmailAccount={gmailAuth.account?.email}
      onConnectGmail={() => setOfflineMode(false)}
      onSignOut={() => {
        void gmailAuth.signOut().catch((error: unknown) => toast.error(String(error)));
      }}
    />
  );
}

export default App;
