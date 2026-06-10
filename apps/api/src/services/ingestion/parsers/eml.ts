import { simpleParser, type AddressObject } from "mailparser";
import type { ParsedDocument } from "./types.js";
import {
  assertWithinByteLimit,
  clampDocumentText,
} from "./limits.js";

function addressText(
  addr: AddressObject | AddressObject[] | undefined
): string {
  if (!addr) return "";
  const list = Array.isArray(addr) ? addr : [addr];
  return list.map((a) => a.text).filter(Boolean).join(", ");
}

// Last-resort body when the email has no text part: strip tags from the HTML
// part. Crude, but the planner only needs readable content, not fidelity.
function htmlToPlainText(html: string): string {
  return html
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function parseEml(buf: Buffer): Promise<ParsedDocument> {
  assertWithinByteLimit(buf, "eml");
  // Attachment payloads are decoded but never analyzed — acceptable because
  // the 20 MB input cap above bounds the inflation.
  const mail = await simpleParser(buf);

  const body =
    mail.text?.trim() ||
    (typeof mail.html === "string" ? htmlToPlainText(mail.html) : "");
  if (!body && !mail.subject) {
    throw new Error("Email contains no readable subject or body.");
  }

  const headerLines = [
    `From: ${addressText(mail.from) || "(unknown)"}`,
    `To: ${addressText(mail.to) || "(unknown)"}`,
  ];
  const cc = addressText(mail.cc);
  if (cc) headerLines.push(`Cc: ${cc}`);
  headerLines.push(`Subject: ${mail.subject ?? "(no subject)"}`);
  if (mail.date) headerLines.push(`Date: ${mail.date.toISOString()}`);
  const attachmentNames = (mail.attachments ?? [])
    .map((a) => a.filename)
    .filter(Boolean);
  if (attachmentNames.length > 0) {
    headerLines.push(
      `Attachments (not analyzed): ${attachmentNames.join(", ")}`
    );
  }

  const text = `${headerLines.join("\n")}\n\n${body}`.trim();
  return { type: "document", text: clampDocumentText(text) };
}
