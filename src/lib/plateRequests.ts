import { printFileMatch } from "@/lib/threeMfInspector";

export interface PlateRequestJob {
  status: string;
  order_id: string;
  printer_id: string | null;
  expected_file_name: string;
  observed_file_name?: string | null;
}

export interface PlateRequestOrder {
  id: string;
  status?: string;
}

export interface PlateRequestPrinter {
  id: string;
  current_file: string | null;
}

export function findPlateRequestPrinter<T extends PlateRequestPrinter>(
  job: PlateRequestJob,
  printers: readonly T[],
): T | undefined {
  return printers.find((item) => item.id === job.printer_id)
    || printers.find((item) => printFileMatch(job.expected_file_name, item.current_file || ""))
    || (printers.length === 1 && ["approved", "printing", "paused"].includes(job.status) ? printers[0] : undefined);
}

export function isVisiblePlateRequest(
  job: PlateRequestJob,
  orders: readonly PlateRequestOrder[],
  printers: readonly PlateRequestPrinter[],
): boolean {
  if (!["suggested", "approved", "printing", "paused"].includes(job.status)) return false;
  const order = orders.find((item) => item.id === job.order_id);
  if (!order || ["completed", "cancelled"].includes(order.status || "")) return false;
  const printer = findPlateRequestPrinter(job, printers);
  const observedFile = printer?.current_file || (["approved", "printing", "paused"].includes(job.status) ? job.observed_file_name : null);
  return Boolean(printer && printFileMatch(job.expected_file_name, observedFile || ""));
}
