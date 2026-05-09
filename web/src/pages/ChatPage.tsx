import { ChatSurface } from "../components/chat/ChatSurface.js";

type ChatPageProps = {
  locale?: "de" | "en";
};

export function ChatPage({ locale = "en" }: ChatPageProps) {
  return (
    <section className="mobile-chat-page" data-testid="mobile-chat-page">
      <ChatSurface locale={locale} />
    </section>
  );
}
