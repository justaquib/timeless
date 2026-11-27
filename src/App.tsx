import { useCallback, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { isTauri } from "@tauri-apps/api/core";
import { LogOut, Settings, ShieldCheck } from "lucide-react";
import { toast } from "react-toastify";
import { useMailerStore } from "./store/mailerStore";
import { usePreferencesStore } from "./store/preferencesStore";
import { countSuccessfulSends, parseEmailAddressList } from "./domain/mailer";
import { mailQuotaBlockReason } from "./domain/mailLimits";
import type { EmailCopyRecipients, SentPeriod } from "./domain/mailer";
import { sectionDetails } from "./domain/workspace";
import type { Section } from "./domain/workspace";
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
import { PreferencesContainer } from "./components/PreferencesContainer";
import { WebScraperContainer } from "./components/WebScraperContainer";
import { TasksContainer } from "./components/TasksContainer";
import { useGmailAuth } from "./hooks/useGmailAuth";
import { useGmailReplyCount } from "./hooks/useGmailReplyCount";
import { sentMailHistoryQueryKey, useSentMailHistory } from "./hooks/useSentMailHistory";
import { useSendQueue } from "./hooks/useSendQueue";
import { useMailSendQuota, useSmtpSettings } from "./hooks/useSmtpSettings";
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
  const dailyLimits = usePreferencesStore((state) => state.dailyLimits);
  const activeDailyLimit = dailyLimits[smtpSettings?.providerFamily ?? "custom"];
  const { data: mailQuota, error: mailQuotaError, resetInSeconds } = useMailSendQuota(
    smtpSettings?.providerFamily,
    smtpSettings?.username,
    activeDailyLimit,
  );
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
    if (!canStartMailSequence(deliveryRecipientCount(copyRecipients))) return;
    try {
      const result = await send({
        recipients,
        dailyLimit: activeDailyLimit,
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
      if (isTauri()) {
        void queryClient.invalidateQueries({ queryKey: ["mail-send-quota"] });
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

  const canStartMailSequence = (recipientCount: number) => {
    const reason = mailQuotaBlockReason(mailQuota, mailQuotaError, recipientCount);
    if (reason) toast.error(reason);
    return reason === null;
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
      if (canStartMailSequence(deliveryRecipientCount(nextCopyRecipients))) {
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

  const sentCount = countSuccessfulSends(sentMail, sentPeriod);
  const appearance = usePreferencesStore((state) => state.appearance);

  return (
    <div className={`workspace-theme ${appearance}-theme min-h-screen bg-[#0a0a0a] text-slate-800`}>
      <Sidebar
        activeSection={activeSection}
        connected={Boolean(smtpSettings)}
        onNavigate={setActiveSection}
        onOpenSettings={() => {
          if (!sending) setSettingsOpen(true);
        }}
      />
      <div className="ml-[220px] min-h-screen min-w-0">
        <header className="workspace-header sticky top-0 z-10 flex min-h-[64px] items-center justify-between border-b border-t border-slate-200/80 bg-white/90 px-5 backdrop-blur-xl sm:px-6">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">Personal workspace</p>
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

        <main className="mx-auto max-w-[1500px] px-4 py-5 sm:px-6 lg:px-7">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-xl font-semibold tracking-tight text-slate-900">{sectionDetails[activeSection].title}</h1>
              <p className="mt-1 text-xs text-slate-500">{sectionDetails[activeSection].description}</p>
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
              mailQuota={mailQuota && { ...mailQuota, resetInSeconds }}
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
          {activeSection === "scraper" && <WebScraperContainer />}
          {activeSection === "tasks" && <TasksContainer />}
          {activeSection === "preferences" && <PreferencesContainer />}

          <footer className="mt-8 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200/80 pt-4 text-[11px] text-slate-400">
            <span>Timeless · Your workspace, your pace</span>
            <span className="inline-flex items-center gap-1.5"><ShieldCheck size={13} /> Credentials stored locally on this device</span>
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
        mailQuota={mailQuota}
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
  const musicEnabled = usePreferencesStore((state) => state.splashMusicEnabled);
  const gmailAuth = useGmailAuth();
  const completeSplash = useCallback(() => setSplashComplete(true), []);

  if (!splashComplete) {
    return <SplashScreen musicEnabled={musicEnabled} onComplete={completeSplash} />;
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
