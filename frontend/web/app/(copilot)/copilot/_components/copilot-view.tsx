'use client';

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bot, Loader2, MessageSquare, Plus, Send, Sparkles, Trash2, User as UserIcon } from 'lucide-react';
import { Button, Skeleton, Textarea, toast } from '@topiadesk/ui';
import { apiFetch, ApiRequestError } from '../../_lib/api';
import { markdownToHtml } from '../../_lib/markdown-preview';
import type { ChatMessageDto, ChatSessionDto, SendChatMessageResponseDto } from '../../_lib/types';

function timeLabel(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  return sameDay ? date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : date.toLocaleDateString();
}

export function CopilotView() {
  const queryClient = useQueryClient();
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const threadEndRef = useRef<HTMLDivElement>(null);

  const sessionsQuery = useQuery({
    queryKey: ['copilot', 'sessions'],
    queryFn: () => apiFetch<ChatSessionDto[]>('/api/ai/chat/sessions'),
  });

  const messagesQuery = useQuery({
    queryKey: ['copilot', 'sessions', activeSessionId, 'messages'],
    queryFn: () => apiFetch<ChatMessageDto[]>(`/api/ai/chat/sessions/${activeSessionId}/messages`),
    enabled: !!activeSessionId,
  });

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messagesQuery.data]);

  const createSession = useMutation({
    mutationFn: () => apiFetch<ChatSessionDto>('/api/ai/chat/sessions', { method: 'POST' }),
    onSuccess: (session) => {
      queryClient.invalidateQueries({ queryKey: ['copilot', 'sessions'] });
      setActiveSessionId(session.id);
    },
    onError: () => toast.error("Couldn't start a new chat"),
  });

  const deleteSession = useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/api/ai/chat/sessions/${id}`, { method: 'DELETE' }),
    onSuccess: (_void, id) => {
      queryClient.invalidateQueries({ queryKey: ['copilot', 'sessions'] });
      if (activeSessionId === id) setActiveSessionId(null);
    },
    onError: () => toast.error("Couldn't delete that chat"),
  });

  const sendMessage = useMutation({
    // `sessionId` is a mutation VARIABLE, not read from `activeSessionId`
    // state — on the very first message of a new chat, handleSubmit calls
    // setActiveSessionId(...) and then mutate() in the same tick, and React
    // batches the state update until the next render. A mutationFn that
    // closed over `activeSessionId` directly would still see `null` at call
    // time, POSTing to `.../sessions/null/messages` and failing — confirmed
    // live as the real cause of "first message errors, then it works."
    // Threading the id through as an explicit argument (also used below in
    // onMutate/onSuccess/onError via `variables`) makes it impossible to be
    // stale.
    mutationFn: ({ sessionId, content }: { sessionId: string; content: string }) =>
      apiFetch<SendChatMessageResponseDto>(`/api/ai/chat/sessions/${sessionId}/messages`, {
        method: 'POST',
        body: JSON.stringify({ content }),
      }),
    onMutate: async ({ sessionId, content }) => {
      // Optimistically show the user's own message immediately — the
      // assistant's reply can take a few seconds (multi-round tool use),
      // no reason to make the user stare at a blank thread meanwhile.
      const key = ['copilot', 'sessions', sessionId, 'messages'];
      const previous = queryClient.getQueryData<ChatMessageDto[]>(key) ?? [];
      queryClient.setQueryData(key, [
        ...previous,
        { id: `optimistic-${Date.now()}`, role: 'USER', content, createdAt: new Date().toISOString() },
      ]);
      return { previous };
    },
    onSuccess: (_data, { sessionId }) => {
      queryClient.invalidateQueries({ queryKey: ['copilot', 'sessions', sessionId, 'messages'] });
      queryClient.invalidateQueries({ queryKey: ['copilot', 'sessions'] });
    },
    onError: (err, { sessionId }, context) => {
      queryClient.setQueryData(['copilot', 'sessions', sessionId, 'messages'], context?.previous ?? []);
      if (err instanceof ApiRequestError && err.status === 503) {
        toast.error('The copilot is temporarily unavailable — try again in a moment.');
      } else if (err instanceof ApiRequestError && err.status === 429) {
        toast.error(err.message);
      } else {
        toast.error("Couldn't reach the copilot — try again shortly");
      }
    },
  });

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const content = draft.trim();
    if (!content) return;
    let sessionId = activeSessionId;
    if (!sessionId) {
      const session = await createSession.mutateAsync();
      sessionId = session.id;
      setActiveSessionId(sessionId);
    }
    setDraft('');
    sendMessage.mutate({ sessionId, content });
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e as unknown as FormEvent);
    }
  }

  const sessions = sessionsQuery.data ?? [];
  const messages = messagesQuery.data ?? [];
  const isSending = sendMessage.isPending || createSession.isPending;

  return (
    // app-shell.tsx's <main> is already `flex-1` inside a `h-screen` flex
    // column, so it's already exactly "the space left after the header" —
    // h-full here just fills that, no guessed pixel/rem header height to
    // keep in sync. -m-4 cancels <main>'s own p-4 so the sidebar/thread/
    // input can each own their full edge-to-edge width instead of floating
    // inset within it.
    <div className="-m-4 flex h-[calc(100%+2rem)]">
      <aside className="flex w-64 shrink-0 flex-col border-r border-border bg-muted/20">
        <div className="p-3">
          <Button size="sm" className="w-full" onClick={() => setActiveSessionId(null)}>
            <Plus className="h-4 w-4" aria-hidden /> New chat
          </Button>
        </div>
        <div className="flex-1 space-y-0.5 overflow-y-auto px-2">
          {sessionsQuery.isLoading ? (
            <div className="space-y-2 p-2">
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
            </div>
          ) : sessions.length === 0 ? (
            <p className="p-3 text-center text-xs text-muted-foreground">No chats yet — ask something to start one.</p>
          ) : (
            sessions.map((session) => (
              <div
                key={session.id}
                className={`group flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm ${
                  session.id === activeSessionId ? 'bg-secondary text-secondary-foreground' : 'text-muted-foreground hover:bg-muted'
                }`}
              >
                <button type="button" onClick={() => setActiveSessionId(session.id)} className="flex flex-1 items-center gap-1.5 truncate text-left">
                  <MessageSquare className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  <span className="truncate">{session.title || 'New chat'}</span>
                </button>
                <button
                  type="button"
                  aria-label="Delete chat"
                  onClick={() => deleteSession.mutate(session.id)}
                  className="shrink-0 opacity-0 hover:text-destructive group-hover:opacity-100"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                </button>
              </div>
            ))
          )}
        </div>
      </aside>

      <div className="flex flex-1 flex-col">
        <div className="flex-1 overflow-y-auto p-6">
          {!activeSessionId ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Sparkles className="h-6 w-6" aria-hidden />
              </div>
              <div>
                <p className="text-lg font-semibold text-foreground">TopiaDesk Copilot</p>
                <p className="max-w-sm text-sm text-muted-foreground">
                  Ask about an account, its policies or open cases, your pipeline, or how to do something in
                  TopiaDesk — the copilot looks up real data and searches the knowledge base while you chat.
                </p>
              </div>
            </div>
          ) : messagesQuery.isLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-16 w-2/3" />
              <Skeleton className="ml-auto h-12 w-1/2" />
            </div>
          ) : (
            <div className="mx-auto max-w-2xl space-y-4">
              {messages.map((message) => (
                <div key={message.id} className={`flex gap-3 ${message.role === 'USER' ? 'flex-row-reverse' : ''}`}>
                  <div
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                      message.role === 'USER' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {message.role === 'USER' ? <UserIcon className="h-4 w-4" aria-hidden /> : <Bot className="h-4 w-4" aria-hidden />}
                  </div>
                  <div className={`flex max-w-[80%] flex-col gap-1 ${message.role === 'USER' ? 'items-end' : 'items-start'}`}>
                    {message.role === 'USER' ? (
                      <div className="whitespace-pre-wrap rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground">{message.content}</div>
                    ) : (
                      // Assistant replies only — markdown-rendered so
                      // generate_report's chart PNG link (`![...](url)`,
                      // see chat-intent-router.ts's answerGenerateReport())
                      // shows as a real inline image instead of raw link
                      // text, bold/links/etc render properly too. The
                      // user's own typed text stays plain (whatever they
                      // type showing up "helpfully" reformatted would be
                      // surprising, not useful).
                      <div
                        className="prose-sm max-w-none rounded-lg bg-muted px-3 py-2 text-sm text-foreground [&_a]:text-primary [&_img]:mt-2 [&_p:not(:last-child)]:mb-2"
                        dangerouslySetInnerHTML={{ __html: markdownToHtml(message.content) }}
                      />
                    )}
                    <span className="text-[11px] text-muted-foreground">{timeLabel(message.createdAt)}</span>
                  </div>
                </div>
              ))}
              {isSending ? (
                <div className="flex items-center gap-2 pl-10 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Thinking…
                </div>
              ) : null}
              <div ref={threadEndRef} />
            </div>
          )}
        </div>

        <form onSubmit={handleSubmit} className="border-t border-border p-4">
          <div className="mx-auto flex max-w-2xl items-end gap-2">
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about an account, your pipeline, or how to do something…"
              rows={1}
              className="max-h-32 min-h-[2.5rem] flex-1 resize-none"
              disabled={isSending}
            />
            <Button type="submit" size="icon" disabled={isSending || !draft.trim()} aria-label="Send">
              {isSending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
