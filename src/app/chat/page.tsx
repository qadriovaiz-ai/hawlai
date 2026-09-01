import MasterChatPage from "@/components/chat/MasterChatPage";
import AiEmployeeHome from "@/components/chat/AiEmployeeHome";

// AI Employee — the work surface plus the Master Brain chat.
//
// The surface is rendered here, on the server, and handed to the chat
// as a prop. Only this route gets it; /chat/[id] renders the same
// component without it, so an open conversation stays pure chat.
export default function ChatPage() {
  return <MasterChatPage workSurface={<AiEmployeeHome />} />;
}
