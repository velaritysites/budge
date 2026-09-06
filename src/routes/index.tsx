import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Loot — Know your loot." },
      { name: "description", content: "A clear view of your income, expenses, plans, and what you can afford." },
      { property: "og:title", content: "Loot — Know your loot." },
      { property: "og:description", content: "A clear view of your income, expenses, plans, and what you can afford." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [{ rel: "canonical", href: "https://budgefin.lovable.app/" }],
  }),
  beforeLoad: () => {
    throw redirect({ to: "/dashboard" });
  },
});
