import { redirect } from "next/navigation";

// Moved to /chat for an immersive, ChatGPT-style layout without the
// full department sidebar. Kept as a redirect so old links/bookmarks
// still work.
export default function MasterBrainRedirect() {
  redirect("/chat");
}
