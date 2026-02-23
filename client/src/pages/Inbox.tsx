import { AppLayout } from "@/components/layout/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sparkles,
  Trash2,
  Archive,
  MoreVertical,
  CornerUpLeft,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { axios } from "@/lib/axios";

const AUTH_API_URL = import.meta.env.VITE_AUTH_API_URL ?? "http://localhost:4000";

type EmailCategory = "INVOICE" | "QUERY" | "SUPPORT" | "CUSTOMER" | "OTHER";

const CATEGORY_TABS: EmailCategory[] = ["INVOICE", "QUERY", "SUPPORT", "CUSTOMER", "OTHER"];

type InboxEmail = {
  id: string;
  provider: string;
  from_name: string;
  from_email: string;
  external_id?: string;
  subject: string;
  snippet: string;
  category?: EmailCategory | null;
  confidence_score?: number | null;
  replied_at?: string | null;
  received_at?: string;
};

type ThreadMessage = {
  id: string;
  thread_id?: string;
  from_name: string;
  from_email: string;
  to?: string;
  subject: string;
  snippet: string;
  received_at?: string;
  direction: "sent" | "received";
};

export default function Inbox() {
  const [location] = useLocation();
  const token = localStorage.getItem("authToken");
  const [emails, setEmails] = useState<InboxEmail[]>([]);
  const [selectedEmail, setSelectedEmail] = useState<InboxEmail | null>(null);
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<EmailCategory>("INVOICE");
  const [draftReply, setDraftReply] = useState("Thanks for your email. We received it and will get back to you shortly.");
  const [sendingReply, setSendingReply] = useState(false);
  const [generatingReply, setGeneratingReply] = useState(false);
  const [threadMessages, setThreadMessages] = useState<ThreadMessage[]>([]);
  const [loadingThread, setLoadingThread] = useState(false);
  const { toast } = useToast();

  const emailIdFromQuery = useMemo(() => {
    const value = new URLSearchParams(window.location.search).get("email");
    return value ? value.trim() : "";
  }, [location]);

  const loadEmails = async () => {
    if (!token) return;

    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set("search", search.trim());
      params.set("category", selectedCategory);

      const response = await axios.get<{ emails: InboxEmail[] }>(
        `${AUTH_API_URL}/emails${params.toString() ? `?${params.toString()}` : ""}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );

      const rows = Array.isArray(response.data?.emails) ? response.data.emails : [];
      setEmails(rows);
      setSelectedEmail((prev) => {
        if (emailIdFromQuery) {
          const matchedEmail = rows.find((row: InboxEmail) => row.id === emailIdFromQuery || row.external_id === emailIdFromQuery);
          if (matchedEmail) return matchedEmail;
        }

        return prev && rows.some((row: InboxEmail) => row.id === prev.id) ? prev : rows[0] || null;
      });
    } catch (error) {
      toast({ title: "Unable to load inbox emails.", description: (error as Error).message || "Please try again." });
    }
  };

  useEffect(() => {
    void loadEmails();
  }, [search, selectedCategory, emailIdFromQuery]);

  const loadThread = async (externalId: string) => {
    if (!token || !externalId) {
      setThreadMessages([]);
      return;
    }

    setLoadingThread(true);
    try {
      const response = await axios.get<{ messages: ThreadMessage[] }>(`${AUTH_API_URL}/emails/thread/${encodeURIComponent(externalId)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      setThreadMessages(Array.isArray(response.data?.messages) ? response.data.messages : []);
    } catch {
      setThreadMessages([]);
    } finally {
      setLoadingThread(false);
    }
  };

  const syncGmail = async () => {
    if (!token) return;
    try {
      const response = await axios.post<{ syncedEmails?: number }>(`${AUTH_API_URL}/email-integrations/gmail/sync`, {}, {
        headers: { Authorization: `Bearer ${token}` },
      });

      toast({ title: `Synced ${Number(response.data?.syncedEmails || 0)} Gmail emails.` });
      void loadEmails();
    } catch (error) {
      toast({ title: "Unable to sync Gmail emails.", description: (error as Error).message || "Please try again." });
    }
  };


  useEffect(() => {
    if (!selectedEmail) {
      setThreadMessages([]);
      return;
    }

    setDraftReply("Thanks for your email. We received it and will get back to you shortly.");
    void loadThread(selectedEmail.external_id || "");
  }, [selectedEmail?.id]);



  const generateAiReply = async () => {
    if (!token || !selectedEmail) return;

    setGeneratingReply(true);

    const contextLines = [
      `Subject: ${selectedEmail.subject || "(no subject)"}`,
      `From: ${selectedEmail.from_name || selectedEmail.from_email || "Unknown sender"}`,
      "",
      "Conversation:",
      ...(threadMessages.length ? threadMessages.map((item) => `${item.direction.toUpperCase()}: ${item.snippet || ""}`) : [selectedEmail.snippet || ""]),
      "",
      "Write a concise professional reply email body.",
    ];

    try {
      const response = await axios.post<{ reply?: string }>(
        `${AUTH_API_URL}/emails/ai-reply`,
        { inputText: contextLines.join("\n") },
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      setDraftReply(String(response.data?.reply || ""));
    } catch (error) {
      toast({ title: "Unable to generate AI reply.", description: (error as Error).message || "Please try again." });
    } finally {
      setGeneratingReply(false);
    }
  };

  const sendReply = async () => {
    if (!token || !selectedEmail) return;

    const recipient = String(selectedEmail.from_email || "").trim();
    if (!recipient) {
      toast({ title: "Selected email has no valid sender address." });
      return;
    }

    const body = draftReply.trim();
    if (!body) {
      toast({ title: "Reply message cannot be empty." });
      return;
    }

    setSendingReply(true);
    try {
      await axios.post(
        `${AUTH_API_URL}/emails/send`,
        {
          to: recipient,
          subject: `Re: ${selectedEmail.subject || "(no subject)"}`,
          body,
          replyToExternalId: selectedEmail.external_id || "",
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      toast({ title: "Reply sent successfully." });
      void loadThread(selectedEmail.external_id || "");
    } catch (error) {
      toast({ title: "Unable to send reply.", description: (error as Error).message || "Please try again." });
    } finally {
      setSendingReply(false);
    }
  };

  const selectedDate = useMemo(() => {
    const raw = selectedEmail?.received_at;
    if (!raw) return "";
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? "" : d.toLocaleString();
  }, [selectedEmail]);

  return (
    <AppLayout>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Inbox</h1>
          <p className="text-muted-foreground mt-1">Connected mailbox emails</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline"><Archive className="w-4 h-4 mr-2" /> Archive All Read</Button>
          <Button onClick={() => { void syncGmail(); }}><Sparkles className="w-4 h-4 mr-2" /> Pull Gmail Emails</Button>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-6 h-[calc(100vh-12rem)]">
        <Card className="col-span-4 flex flex-col overflow-hidden border-sidebar-border">
          <div className="p-4 border-b border-border bg-muted/30 space-y-3">
            <Input placeholder="Search emails..." className="bg-background" value={search} onChange={(event) => setSearch(event.target.value)} />
            <div className="flex flex-wrap gap-2">
              {CATEGORY_TABS.map((category) => (
                <Button
                  key={category}
                  type="button"
                  size="sm"
                  variant={selectedCategory === category ? "default" : "outline"}
                  onClick={() => setSelectedCategory(category)}
                >
                  {category[0]}{category.slice(1).toLowerCase()}
                </Button>
              ))}
            </div>
          </div>
          <ScrollArea className="flex-1">
            <div className="divide-y divide-border">
              {emails.map((email) => (
                <div
                  key={email.id}
                  onClick={() => setSelectedEmail(email)}
                  className={`p-4 cursor-pointer hover:bg-accent/30 transition-colors ${selectedEmail?.id === email.id ? "bg-accent/50 border-l-4 border-primary" : "border-l-4 border-transparent"}`}
                >
                  <div className="flex justify-between items-start mb-1">
                    <h4 className={`font-semibold text-sm ${selectedEmail?.id === email.id ? "text-foreground" : "text-muted-foreground"}`}>{email.from_name || email.from_email || "Unknown sender"}</h4>
                    <span className="text-xs text-muted-foreground">{email.received_at ? new Date(email.received_at).toLocaleDateString() : ""}</span>
                  </div>
                  <h3 className="font-medium text-sm text-foreground mb-1 truncate">{email.subject || "(no subject)"}</h3>
                  <p className="text-xs text-muted-foreground line-clamp-2">{email.snippet || "No preview"}</p>
                  <div className="mt-3 flex gap-2 flex-wrap">
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 border-blue-200 text-blue-600 bg-blue-50">
                      {String(email.provider || "email").toUpperCase()}
                    </Badge>
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-5">
                      {String(email.category || "OTHER").toUpperCase()}
                      {typeof email.confidence_score === "number" ? ` • ${Math.round(Number(email.confidence_score) * 100)}%` : ""}
                    </Badge>
                  </div>
                </div>
              ))}
              {emails.length === 0 && <p className="p-4 text-sm text-muted-foreground">No emails yet. Connect Gmail in Settings and pull emails.</p>}
            </div>
          </ScrollArea>
        </Card>

        <Card className="col-span-8 flex flex-col overflow-hidden border-sidebar-border shadow-lg">
          {selectedEmail ? (
            <>
              <div className="p-6 border-b border-border flex justify-between items-start bg-muted/10">
                <div>
                  <h2 className="text-xl font-bold text-foreground mb-2">{selectedEmail.subject || "(no subject)"}</h2>
                  <div className="flex items-center gap-3 text-sm">
                    <span className="font-medium text-foreground">{selectedEmail.from_name || selectedEmail.from_email || "Unknown sender"}</span>
                    <span className="text-muted-foreground">to me</span>
                    {selectedDate && <span className="text-muted-foreground">• {selectedDate}</span>}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="ghost" size="icon"><Archive className="w-4 h-4" /></Button>
                  <Button variant="ghost" size="icon"><Trash2 className="w-4 h-4" /></Button>
                  <Button variant="ghost" size="icon"><MoreVertical className="w-4 h-4" /></Button>
                </div>
              </div>

              <ScrollArea className="flex-1 p-6">
                <div className="space-y-3">
                  {loadingThread && <p className="text-sm text-muted-foreground">Loading thread...</p>}
                  {!loadingThread && threadMessages.length === 0 && (
                    <div className="prose prose-sm max-w-none text-foreground">
                      <p className="whitespace-pre-line">{selectedEmail.snippet || "No content available"}</p>
                    </div>
                  )}
                  {threadMessages.map((item) => {
                    const isSent = item.direction === "sent";
                    const when = item.received_at ? new Date(item.received_at).toLocaleString() : "";
                    return (
                      <div key={item.id} className={`flex ${isSent ? "justify-end" : "justify-start"}`}>
                        <div className={`max-w-[78%] rounded-xl border px-4 py-3 ${isSent ? "bg-primary text-primary-foreground border-primary/40" : "bg-background border-border"}`}>
                          <div className="mb-1 flex items-center gap-2 text-xs opacity-80">
                            <span>{isSent ? "Sent" : "Received"}</span>
                            {when && <span>• {when}</span>}
                          </div>
                          <p className="whitespace-pre-line text-sm">{item.snippet || "(no content)"}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="mt-8 border border-primary/20 bg-primary/5 rounded-xl p-5 relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-1 h-full bg-primary" />
                  <div className="flex items-center gap-2 mb-4">
                    <div className="p-1.5 bg-primary/10 rounded-md">
                      <Sparkles className="w-4 h-4 text-primary" />
                    </div>
                    <h3 className="font-semibold text-primary">AI Agent Suggestion</h3>
                  </div>

                  <div className="bg-background rounded-lg border border-border p-4 shadow-sm mb-4">
                    <p className="text-sm text-muted-foreground mb-2">Draft Reply:</p>
                    <Textarea
                      value={draftReply}
                      onChange={(event) => setDraftReply(event.target.value)}
                      className="min-h-28"
                      placeholder="Write your reply..."
                    />
                  </div>

                  <div className="flex gap-3">
                    <Button className="bg-primary hover:bg-primary/90 text-white shadow-md shadow-primary/20" onClick={() => { void sendReply(); }} disabled={sendingReply || Boolean(selectedEmail?.replied_at)}>
                      <CornerUpLeft className="w-4 h-4 mr-2" /> {selectedEmail?.replied_at ? "Already Replied" : (sendingReply ? "Sending..." : "Send Reply") }
                    </Button>
                    <Button variant="outline" className="bg-background" onClick={() => { void generateAiReply(); }} disabled={generatingReply}>
                      {generatingReply ? "Generating..." : "Generate AI Reply"}
                    </Button>
                    <Button variant="ghost" className="ml-auto text-muted-foreground" onClick={() => setDraftReply("")}>Dismiss</Button>
                  </div>
                </div>
              </ScrollArea>
            </>
          ) : (
            <div className="p-8 text-sm text-muted-foreground">No email selected.</div>
          )}
        </Card>
      </div>
    </AppLayout>
  );
}
