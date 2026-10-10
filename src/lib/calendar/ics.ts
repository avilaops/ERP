/**
 * A calendar invitation as mail programs read it (RFC 5545 with the scheduling
 * of RFC 5546): one event, in UTC, that is a request or its cancellation. Pure:
 * the same input is the same bytes.
 */
export type CalendarEvent = {
  /** What identifies the event in every calendar; the same across updates. */
  uid: string;
  /** The version: a calendar keeps the highest it has seen. */
  sequence: number;
  method: "REQUEST" | "CANCEL";
  start: Date;
  minutes: number;
  summary: string;
  description: string | null;
  /** Where: an address of a video call, or a place. */
  location: string | null;
  /** The address of a video call, when there is one. */
  url: string | null;
  organizer: { name: string; email: string };
  attendee: { name: string; email: string };
  /** When this version was written. */
  stamp: Date;
};

/** `20261009T150000Z`. */
const utc = (date: Date) => date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

/** A text value: backslash, semicolon, comma and line break escaped; other control characters removed. */
const text = (value: string) => value.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, "").replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");

/** A parameter value in quotes: no quote, no control character. */
const quoted = (value: string) => `"${value.replace(/["\u0000-\u001f\u007f]/g, "").trim()}"`;

/** An address after `mailto:`: nothing that would end the value or start another. */
const address = (value: string) => value.replace(/[\s<>";,:\\]/g, "");

/** Lines of at most 75 octets: what is beyond continues on the next line after a space, never cutting a character. */
function folded(line: string): string {
  const parts: string[] = [];
  let chunk = "";
  for (const character of line) {
    if (Buffer.byteLength(chunk + character, "utf8") > (parts.length === 0 ? 75 : 74)) {
      parts.push(chunk);
      chunk = "";
    }
    chunk += character;
  }
  parts.push(chunk);
  return parts.join("\r\n ");
}

export function buildCalendar(event: CalendarEvent): string {
  const end = new Date(event.start.getTime() + event.minutes * 60_000);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Avila Ops//ERP//PT",
    "CALSCALE:GREGORIAN",
    `METHOD:${event.method}`,
    "BEGIN:VEVENT",
    `UID:${text(event.uid)}`,
    `SEQUENCE:${event.sequence}`,
    `DTSTAMP:${utc(event.stamp)}`,
    `DTSTART:${utc(event.start)}`,
    `DTEND:${utc(end)}`,
    `SUMMARY:${text(event.summary)}`,
    event.description ? `DESCRIPTION:${text(event.description)}` : null,
    event.location ? `LOCATION:${text(event.location)}` : null,
    event.url ? `URL:${event.url.replace(/[\s\u0000-\u001f]/g, "")}` : null,
    `ORGANIZER;CN=${quoted(event.organizer.name)}:mailto:${address(event.organizer.email)}`,
    `ATTENDEE;CN=${quoted(event.attendee.name)};ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:${address(event.attendee.email)}`,
    `STATUS:${event.method === "CANCEL" ? "CANCELLED" : "CONFIRMED"}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter((line): line is string => line !== null);
  return `${lines.map(folded).join("\r\n")}\r\n`;
}
