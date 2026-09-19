export type PrinterStatusLike = {
  status?: string | null;
  last_seen_at?: string | null;
};

/**
 * The printer is refreshed manually, so last_seen_at can legitimately be old.
 * Only the status reported by the bridge may decide whether it is offline.
 */
export const displayedPrinterStatus = (printer: PrinterStatusLike) => {
  const status = String(printer.status || "").trim().toLowerCase();
  return status || "onbekend";
};
