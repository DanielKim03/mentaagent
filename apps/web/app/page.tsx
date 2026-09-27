import { redirect } from "next/navigation";

// Self-hosted and single-user: there is no landing page or sign-in, the app
// opens straight into the chat.
export default function Home() {
  redirect("/chat");
}
