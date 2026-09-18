import { toISODate } from "@/lib/utils";
import type {
  CustomTemplate,
  CustomTemplateStatus,
  TemplateButton,
  TemplateMediaKind,
} from "@/types";

export function toPublicTemplate(row: {
  id: string;
  clientId: string;
  name: string;
  language: string;
  category: string;
  status: string;
  header: string | null;
  body: string;
  footer: string | null;
  mediaKind: string;
  mediaUrl: string | null;
  mediaFileName: string | null;
  buttons: unknown;
  variables: string[];
  createdAt: Date;
  updatedAt: Date;
}): CustomTemplate {
  return {
    id: row.id,
    clientId: row.clientId,
    name: row.name,
    language: row.language,
    category: row.category as CustomTemplate["category"],
    status: row.status as CustomTemplateStatus,
    header: row.header ?? undefined,
    body: row.body,
    footer: row.footer ?? undefined,
    media: {
      kind: row.mediaKind as TemplateMediaKind,
      url: row.mediaUrl ?? "",
      fileName: row.mediaFileName ?? undefined,
    },
    buttons: Array.isArray(row.buttons) ? (row.buttons as TemplateButton[]) : [],
    variables: row.variables,
    createdAt: toISODate(row.createdAt),
    updatedAt: toISODate(row.updatedAt),
  };
}
