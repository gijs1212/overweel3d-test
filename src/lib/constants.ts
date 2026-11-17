export const ORDER_STATUSES = {
  draft: { label: "Concept", color: "bg-muted text-muted-foreground" },
  submitted: { label: "Ingediend", color: "bg-neutral-200 text-neutral-800" },
  under_review: { label: "In behandeling", color: "bg-neutral-900 text-white" },
  waiting_for_approval: { label: "Wacht op goedkeuring", color: "border border-neutral-400 bg-white text-neutral-800" },
  approved_by_customer: { label: "Goedgekeurd", color: "bg-neutral-800 text-white" },
  rejected_by_customer: { label: "Afgewezen", color: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200" },
  waiting_for_payment: { label: "Wacht op betaling", color: "bg-neutral-200 text-neutral-800" },
  in_production: { label: "In productie", color: "bg-black text-white" },
  completed: { label: "Voltooid", color: "border border-neutral-300 bg-neutral-100 text-neutral-700" },
  cancelled: { label: "Geannuleerd", color: "bg-muted text-muted-foreground" },
} as const;

export type OrderStatus = keyof typeof ORDER_STATUSES;

export const MATERIALS = [
  {
    id: "pla",
    name: "PLA",
    pricePerGram: 0.05,
    colors: [
      { id: "white", name: "Wit", hex: "#FFFFFF" },
      { id: "jade-white", name: "Jadewit", hex: "#FFFFFF" },
      { id: "black", name: "Zwart", hex: "#000000" },
      { id: "blue", name: "Blauw", hex: "#0A2989" },
      { id: "sunflower-yellow", name: "Zonnebloemgeel", hex: "#FEC600" },
      { id: "bambu-green", name: "Bamboegroen", hex: "#00AE42" },
      { id: "blue-grey", name: "Blauwgrijs", hex: "#5B6579" },
      { id: "pumpkin-orange", name: "Pompoenoranje", hex: "#FF9016" },
      { id: "ice-blue-translucent", name: "Ice Blue (Translucent)", hex: "#B8CDE9" },
      { id: "green", name: "Groen", hex: "#00CC00" },
      { id: "leafgreen", name: "Bladgroen", hex: "#228B22" },
      { id: "red", name: "Rood", hex: "#FF0000" },
      { id: "yellow", name: "Geel", hex: "#FFDD00" },
      { id: "grey", name: "Grijs", hex: "#808080" },
    ],
  },
  {
    id: "petg",
    name: "PETG",
    pricePerGram: 0.07,
    colors: [
      { id: "white", name: "Wit", hex: "#FFFFFF" },
      { id: "black", name: "Zwart", hex: "#000000" },
      { id: "red", name: "Rood", hex: "#FF0000" },
      { id: "reflex-blue", name: "Reflex Blue", hex: "#001A89" },
    ],
  },
  {
    id: "tpu",
    name: "TPU",
    pricePerGram: 0.10,
    colors: [
      { id: "black", name: "Zwart", hex: "#000000" },
    ],
  },
];

// iOS/Safari doesn't recognize custom extensions well, so we include broad MIME types as fallback
export const ACCEPTED_FILE_TYPES = ".stl,.obj,.3mf,.step,.stp,model/stl,application/vnd.ms-pki.stl,application/octet-stream,model/obj,application/x-tgif,*/*";
export const MAX_FILE_SIZE = 250 * 1024 * 1024; // 250 MB
