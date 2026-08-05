import { LiveChatWidgetDemo } from './live-chat-widget-demo';

export const metadata = {
  title: 'Live Chat Widget',
};

export default function WidgetDemoPage() {
  return (
    <div className="max-w-2xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Live Chat Widget</h1>
        <p className="text-sm text-muted-foreground">
          This is the omnichannel live-chat entry point — a website visitor with no TopiaDesk account can start a
          conversation here, which creates a real Case behind the scenes. Try it below: send a message, then open the
          Case it created under Cases and reply from there — your reply will show up in the widget on the next poll.
        </p>
      </div>
      <LiveChatWidgetDemo />
    </div>
  );
}
