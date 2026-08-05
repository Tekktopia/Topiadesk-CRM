'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Send } from 'lucide-react';
import { Button, Card, CardContent, Input } from '@topiadesk/ui';

interface ChatMessage {
  id: string;
  direction: string;
  body: string | null;
  occurredAt: string;
  fromAgent: boolean;
}

interface ChatSession {
  caseId: string;
  sessionToken: string;
}

/**
 * Simulates what an anonymous website visitor's own browser would do —
 * every fetch here goes through app/api/public/live-chat/**, which forwards
 * to backend/api with no Authorization header at all (see
 * app/api/public/_lib/public-proxy.ts). The demo page hosting this
 * component is itself behind the normal login gate; the widget's own calls
 * are not.
 */
export function LiveChatWidgetDemo() {
  const queryClient = useQueryClient();
  const [session, setSession] = React.useState<ChatSession | null>(null);
  const [name, setName] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [draft, setDraft] = React.useState('');
  const bottomRef = React.useRef<HTMLDivElement>(null);

  const startMutation = useMutation({
    mutationFn: async (initialMessage: string): Promise<ChatSession> => {
      const res = await fetch('/api/public/live-chat/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, initialMessage }),
      });
      if (!res.ok) throw new Error('Failed to start chat');
      return res.json();
    },
    onSuccess: setSession,
  });

  const messagesQuery = useQuery({
    queryKey: ['widget-demo', 'messages', session?.caseId],
    queryFn: async (): Promise<ChatMessage[]> => {
      if (!session) return [];
      const res = await fetch(`/api/public/live-chat/sessions/${session.caseId}/messages?sessionToken=${encodeURIComponent(session.sessionToken)}`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: Boolean(session),
    refetchInterval: 4_000,
  });

  const sendMutation = useMutation({
    mutationFn: async (message: string) => {
      if (!session) return;
      await fetch(`/api/public/live-chat/sessions/${session.caseId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, sessionToken: session.sessionToken }),
      });
    },
    onSuccess: () => {
      setDraft('');
      queryClient.invalidateQueries({ queryKey: ['widget-demo', 'messages', session?.caseId] });
    },
  });

  React.useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messagesQuery.data]);

  if (!session) {
    return (
      <Card className="max-w-sm">
        <CardContent className="space-y-3 pt-6">
          <h2 className="font-medium">Start a conversation</h2>
          <Input placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} />
          <Input placeholder="Your email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <Input
            placeholder="How can we help?"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && name && email && draft) startMutation.mutate(draft);
            }}
          />
          <Button
            className="w-full"
            disabled={!name || !email || !draft || startMutation.isPending}
            onClick={() => startMutation.mutate(draft)}
          >
            {startMutation.isPending ? 'Starting…' : 'Start chat'}
          </Button>
          {startMutation.isError ? <p className="text-sm text-destructive">Couldn&apos;t start the chat — try again.</p> : null}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="max-w-sm">
      <CardContent className="flex h-96 flex-col gap-2 pt-6">
        <div className="flex-1 space-y-2 overflow-y-auto pr-1">
          {(messagesQuery.data ?? []).map((m) => (
            <div key={m.id} className={`flex ${m.fromAgent ? 'justify-start' : 'justify-end'}`}>
              <div
                className={`max-w-[80%] rounded-lg px-3 py-1.5 text-sm ${
                  m.fromAgent ? 'bg-muted text-foreground' : 'bg-primary text-primary-foreground'
                }`}
              >
                {m.body}
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
        <div className="flex items-center gap-2">
          <Input
            placeholder="Type a message…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && draft) sendMutation.mutate(draft);
            }}
          />
          <Button size="icon" disabled={!draft || sendMutation.isPending} onClick={() => sendMutation.mutate(draft)} aria-label="Send">
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
