import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "LeadHunter — Prospecção de leads B2B" },
      { name: "description", content: "Encontre, organize e acompanhe leads de empresas com dados abertos." },
      { property: "og:title", content: "LeadHunter — Prospecção de leads B2B" },
      { property: "og:description", content: "Encontre, organize e acompanhe leads de empresas com dados abertos." },
    ],
  }),
  beforeLoad: () => {
    throw redirect({ to: "/dashboard" });
  },
});
