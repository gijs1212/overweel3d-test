export const ORDER_STATUSES = {
  draft: { label: "Concept", color: "bg-muted text-muted-foreground" },
  submitted: { label: "Ingediend", color: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200" },
  under_review: { label: "In behandeling", color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200" },
  waiting_for_approval: { label: "Wacht op goedkeuring", color: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200" },
  approved_by_customer: { label: "Goedgekeurd", color: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" },
  rejected_by_customer: { label: "Afgewezen", color: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200" },
  waiting_for_payment: { label: "Wacht op betaling", color: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200" },
  in_production: { label: "In productie", color: "bg-accent/20 text-accent" },
  completed: { label: "Voltooid", color: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" },
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
      { id: "black", name: "Zwart", hex: "#000000" },
      { id: "blue", name: "Blauw", hex: "#0066FF" },
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

export const ACCEPTED_FILE_TYPES = ".stl,.obj,.3mf,.step,.stp";
export const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
