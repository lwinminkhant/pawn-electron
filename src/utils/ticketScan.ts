const MYANMAR_TO_ENGLISH_DIGITS: Record<string, string> = {
  "၀": "0",
  "၁": "1",
  "၂": "2",
  "၃": "3",
  "၄": "4",
  "၅": "5",
  "၆": "6",
  "၇": "7",
  "၈": "8",
  "၉": "9",
};

export function normalizeTicketDigits(value: string) {
  return value.replace(
    /[၀-၉]/g,
    (digit) => MYANMAR_TO_ENGLISH_DIGITS[digit] ?? digit,
  );
}

export function buildTicketQrPayload(ticketId: number) {
  return JSON.stringify({
    type: "pawn-ticket",
    ticketId,
  });
}

function parseNumericTicketId(value: string) {
  const trimmed = normalizeTicketDigits(value).trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const ticketId = Number.parseInt(trimmed, 10);
  return Number.isFinite(ticketId) && ticketId > 0 ? ticketId : null;
}

function parseJsonTicketId(value: string) {
  try {
    const payload = JSON.parse(value);
    const rawTicketId =
      payload?.ticketId ?? payload?.pawnId ?? payload?.id ?? payload?.ticket;
    const ticketId =
      typeof rawTicketId === "string"
        ? Number.parseInt(rawTicketId, 10)
        : Number(rawTicketId);
    return Number.isFinite(ticketId) && ticketId > 0 ? ticketId : null;
  } catch {
    return null;
  }
}

function parseUrlTicketId(value: string) {
  try {
    const url = new URL(value);
    const candidates = [
      url.searchParams.get("ticketId"),
      url.searchParams.get("pawnId"),
      url.searchParams.get("ticket"),
      url.searchParams.get("id"),
    ];
    for (const candidate of candidates) {
      if (!candidate) continue;
      const ticketId = parseNumericTicketId(candidate);
      if (ticketId != null) return ticketId;
    }
  } catch {
    return null;
  }
  return null;
}

export function extractTicketIdFromScan(value: string) {
  const trimmed = normalizeTicketDigits(value).trim();
  if (!trimmed) return null;

  const direct = parseNumericTicketId(trimmed);
  if (direct != null) return direct;

  const json = parseJsonTicketId(trimmed);
  if (json != null) return json;

  const prefixed = trimmed.match(
    /(?:pawn-ticket|ticket|pawn)[\s:#-]*([0-9]+)/i,
  );
  if (prefixed) return parseNumericTicketId(prefixed[1]);

  const url = parseUrlTicketId(trimmed);
  if (url != null) return url;

  const loose = trimmed.match(/\b([1-9][0-9]{0,9})\b/);
  if (loose) return parseNumericTicketId(loose[1]);

  return null;
}
