"use client";

import {
  ExternalLink,
  FileText,
  Image as ImageIcon,
  MessageCircle,
  MessageSquareReply,
  Phone,
  Video,
} from "lucide-react";
import { fillTemplate } from "@/lib/utils";
import type { CarouselCard, TemplateButton, TemplateExtra, TemplateKind, TemplateMedia } from "@/types";

const mediaLabels: Record<Exclude<TemplateMedia["kind"], "none">, {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = {
  image: { label: "Image", icon: ImageIcon },
  video: { label: "Video", icon: Video },
  document: { label: "Document", icon: FileText },
};

const buttonIcons: Record<TemplateButton["kind"], React.ComponentType<{ className?: string }>> = {
  whatsapp: MessageCircle,
  call: Phone,
  url: ExternalLink,
  quick_reply: MessageSquareReply,
};

const buttonDefaultLabels: Record<TemplateButton["kind"], string> = {
  whatsapp: "Chat with us",
  call: "Call us",
  url: "Open link",
  quick_reply: "Yes, I'm interested",
};

/** The kind-specific preview props (named variables, coupon/offer/carousel) for a saved template. */
export function previewKindProps(t: {
  parameterFormat?: "positional" | "named";
  templateKind?: TemplateKind;
  extra?: TemplateExtra;
  variables: string[];
}) {
  const kind = t.templateKind ?? "standard";
  const extra = t.extra ?? {};
  return {
    format: t.parameterFormat ?? "positional",
    names: t.variables,
    extraButtons:
      kind === "authentication"
        ? ["Copy code"]
        : (kind === "coupon" || kind === "lto") && extra.couponCode
          ? [`Copy code: ${extra.couponCode}`]
          : [],
    offerText: kind === "lto" ? extra.offerText : undefined,
    cards: kind === "carousel" ? (extra.cards ?? []) : [],
  } as const;
}

/**
 * Renders how the message will look in WhatsApp. Everything is driven by props,
 * so the preview updates as soon as the template, variables, media, or buttons
 * change.
 */
export default function TemplatePreview({
  header,
  body,
  footer,
  media = { kind: "none", url: "" },
  buttons = [],
  values = [],
  emptyHint = "Start typing a message body to see the preview.",
  format = "positional",
  names = [],
  extraButtons = [],
  offerText,
  cards = [],
}: {
  header?: string;
  body: string;
  footer?: string;
  media?: TemplateMedia;
  buttons?: TemplateButton[];
  /** Sample values substituted into {{1}}, {{2}} … */
  values?: string[];
  emptyHint?: string;
  /** "named" templates match values to {{name}} placeholders via `names`. */
  format?: "positional" | "named";
  names?: string[];
  /** Extra labels rendered like buttons (e.g. a coupon's "Copy offer code"). */
  extraButtons?: string[];
  /** Limited-time-offer badge text. */
  offerText?: string;
  /** Carousel cards shown beneath the message. */
  cards?: CarouselCard[];
}) {
  const filled = fillTemplate(body, values, format, names);
  const mediaMeta =
    media.kind !== "none" ? mediaLabels[media.kind] : null;

  return (
    <div className="rounded-xl bg-slate-100 p-4">
      <div className="ml-auto max-w-[92%] overflow-hidden rounded-2xl rounded-tr-sm bg-emerald-100 text-sm text-slate-800">
        {media.kind === "image" && media.url.trim() && (
          // eslint-disable-next-line @next/next/no-img-element -- previewing an uploaded file from our own /uploads path, not worth next/image's config here
          <img src={media.url} alt="" className="h-40 w-full object-cover" />
        )}
        {media.kind === "video" && media.url.trim() && (
          // Real, playable preview — same file that'll actually be sent as
          // the template's HEADER, not just a filename row like documents.
          <video
            key={media.url}
            src={media.url}
            controls
            className="h-48 w-full bg-black object-contain"
          />
        )}
        {mediaMeta && !(media.url.trim() && (media.kind === "image" || media.kind === "video")) && (
          <div className="flex items-center gap-2 border-b border-emerald-200/70 bg-emerald-50 px-3.5 py-3 text-xs text-emerald-900">
            <mediaMeta.icon className="h-4 w-4 shrink-0" />
            <span className="min-w-0 flex-1 truncate">
              {media.fileName?.trim()
                ? media.fileName
                : media.url.trim()
                  ? media.url
                  : `${mediaMeta.label} attachment`}
            </span>
          </div>
        )}

        {offerText?.trim() && (
          <div className="border-b border-emerald-200/70 bg-amber-50 px-3.5 py-2 text-xs font-semibold text-amber-800">
            ⏳ {offerText} — offer ends soon
          </div>
        )}

        <div className="px-3.5 py-2.5">
          {header?.trim() && <p className="mb-1 font-semibold">{header}</p>}
          {filled.trim() ? (
            <p className="whitespace-pre-line leading-relaxed">{filled}</p>
          ) : (
            <p className="italic leading-relaxed text-slate-500">{emptyHint}</p>
          )}
          {footer?.trim() && (
            <p className="mt-2 text-xs text-slate-500">{footer}</p>
          )}
        </div>

        {(buttons.length > 0 || extraButtons.length > 0) && (
          <div className="space-y-px border-t border-emerald-200/70 bg-emerald-50">
            {extraButtons.map((label) => (
              <div key={label} className="flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-sky-700">
                <span className="truncate">⧉ {label}</span>
              </div>
            ))}
            {buttons.map((button) => {
              const Icon = buttonIcons[button.kind];
              return (
                <div
                  key={button.id}
                  className="flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-sky-700"
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span className="truncate">
                    {button.label.trim() || buttonDefaultLabels[button.kind]}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {cards.length > 0 && (
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {cards.map((card, index) => (
            <div key={index} className="w-40 shrink-0 overflow-hidden rounded-xl bg-white text-xs text-slate-800 shadow-sm">
              {card.mediaUrl ? (
                card.mediaKind === "video" ? (
                  <video src={card.mediaUrl} className="h-24 w-full bg-black object-cover" />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element -- previewing an uploaded file
                  <img src={card.mediaUrl} alt="" className="h-24 w-full object-cover" />
                )
              ) : (
                <div className="flex h-24 items-center justify-center bg-slate-100 text-slate-400">No media</div>
              )}
              <p className="px-2 py-1.5">{card.body || "Card text"}</p>
              {card.buttons.map((b, i) => (
                <p key={i} className="border-t border-slate-100 px-2 py-1.5 text-center font-medium text-sky-700">
                  {b.label || "Button"}
                </p>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
