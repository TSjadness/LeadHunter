import { Facebook, Globe, Instagram, Linkedin, Mail, MessageCircle, Phone } from "lucide-react";
import { NOT_VERIFIED } from "@/lib/constants";
import { safeHref, whatsappLink } from "@/lib/normalize";
import { cn } from "@/lib/utils";

type Contacts = {
  phone?: string | null;
  whatsapp?: string | null;
  email?: string | null;
  website?: string | null;
  instagram?: string | null;
  facebook?: string | null;
  linkedin?: string | null;
};

const shortUrl = (u: string) => u.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");

/** Contact list that only links to safe http(s)/tel/mailto targets; missing data is labelled. */
export function ContactLinks({
  c,
  showMissing = true,
  className,
}: {
  c: Contacts;
  showMissing?: boolean;
  className?: string;
}) {
  const rows: {
    icon: typeof Phone;
    label: string;
    value: string | null | undefined;
    href?: string | undefined;
  }[] = [
    {
      icon: Phone,
      label: "Telefone",
      value: c.phone,
      href: c.phone ? `tel:${c.phone.replace(/[^\d+]/g, "")}` : undefined,
    },
    { icon: MessageCircle, label: "WhatsApp", value: c.whatsapp, href: whatsappLink(c.whatsapp) },
    {
      icon: Mail,
      label: "E-mail",
      value: c.email,
      href: c.email ? `mailto:${c.email}` : undefined,
    },
    {
      icon: Globe,
      label: "Site",
      value: c.website ? shortUrl(c.website) : null,
      href: safeHref(c.website),
    },
    {
      icon: Instagram,
      label: "Instagram",
      value: c.instagram ? shortUrl(c.instagram) : null,
      href: safeHref(c.instagram),
    },
    {
      icon: Facebook,
      label: "Facebook",
      value: c.facebook ? shortUrl(c.facebook) : null,
      href: safeHref(c.facebook),
    },
    {
      icon: Linkedin,
      label: "LinkedIn",
      value: c.linkedin ? shortUrl(c.linkedin) : null,
      href: safeHref(c.linkedin),
    },
  ];
  const visible = showMissing
    ? rows.filter((r) => r.value || ["Telefone", "E-mail", "Site"].includes(r.label))
    : rows.filter((r) => r.value);
  return (
    <ul className={cn("space-y-1.5 text-sm", className)}>
      {visible.map(({ icon: Icon, label, value, href }) => (
        <li key={label} className="flex min-w-0 items-center gap-2">
          <Icon
            className={cn("h-4 w-4 shrink-0", value ? "text-primary" : "text-muted-foreground/60")}
            aria-hidden
          />
          <span className="sr-only">{label}:</span>
          {value ? (
            href ? (
              <a
                href={href}
                target={href.startsWith("http") ? "_blank" : undefined}
                rel="noopener noreferrer nofollow"
                className="truncate underline-offset-4 hover:text-primary hover:underline"
              >
                {value}
              </a>
            ) : (
              <span className="truncate">{value}</span>
            )
          ) : (
            <span className="text-muted-foreground">
              {label}: {NOT_VERIFIED}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
