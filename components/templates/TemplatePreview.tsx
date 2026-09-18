"use client";

import { ExternalLink, FileText, Image as ImageIcon, MessageCircle, Phone, Video } from "lucide-react";
import { fillTemplate } from "@/lib/utils";
import type { TemplateButton, TemplateMedia } from "@/types";

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
};

const buttonDefaultLabels: Record<TemplateButton["kind"], string> = {
  whatsapp: "Chat with us",
  call: "Call us",
  url: "Open link",
};

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
}: {
  header?: string;
  body: string;
  footer?: string;
  media?: TemplateMedia;
  buttons?: TemplateButton[];
  /** Sample values substituted into {{1}}, {{2}} … */
  values?: string[];
  emptyHint?: string;
}) {
  const filled = fillTemplate(body, values);
  const mediaMeta =
    media.kind !== "none" ? mediaLabels[media.kind] : null;

  return (
    <div className="rounded-xl bg-slate-100 p-4">
      <div className="ml-auto max-w-[92%] overflow-hidden rounded-2xl rounded-tr-sm bg-emerald-100 text-sm text-slate-800">
        {media.kind === "image" && media.url.trim() && (
          // eslint-disable-next-line @next/next/no-img-element -- previewing an uploaded file from our own /uploads path, not worth next/image's config here
          <img src={media.url} alt="" className="h-40 w-full object-cover" />
        )}
        {mediaMeta && !(media.kind === "image" && media.url.trim()) && (
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

        {buttons.length > 0 && (
          <div className="space-y-px border-t border-emerald-200/70 bg-emerald-50">
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
    </div>
  );
}
