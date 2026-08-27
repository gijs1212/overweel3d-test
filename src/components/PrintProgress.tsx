import { getPlateRunProgress } from "@/lib/plateRunProgress";

interface PrintProgressProps {
  totalProducts: number;
  totalPlates: number;
  platePrintStatuses: boolean[];
  platePrintQuantities: number[];
  plateRunsCompleted: number[];
}

export function PrintProgress({ totalProducts, totalPlates, platePrintStatuses, platePrintQuantities, plateRunsCompleted }: PrintProgressProps) {
  if (totalProducts === 0 && totalPlates === 0) return null;

  const statuses = Array.from(
    { length: Math.max(0, totalPlates) },
    (_, index) => platePrintStatuses[index] === true,
  );
  const platesCompleted = statuses.filter(Boolean).length;
  const runProgress = Array.from(
    { length: Math.max(0, totalPlates) },
    (_, index) => getPlateRunProgress(Number(platePrintQuantities[index]), Number(plateRunsCompleted[index]), statuses[index]),
  );
  const quantities = runProgress.map((plate) => plate.required);
  const totalPrintRuns = quantities.reduce((sum, quantity) => sum + quantity, 0);
  const completedRuns = runProgress.map((plate) => plate.completed);
  const completedPrintRuns = completedRuns.reduce((sum, completed) => sum + completed, 0);
  const progressPercent = totalPrintRuns > 0 ? (completedPrintRuns / totalPrintRuns) * 100 : 0;

  return (
    <div className="bg-card rounded-2xl p-6 shadow-sm border border-border/50">
      <h3 className="font-bold text-primary mb-4">🖨️ Printvoortgang</h3>
      
      <div className="mb-3">
        <div className="flex justify-between text-sm mb-1">
          <span className="text-muted-foreground">Voortgang</span>
          <span className="font-medium text-primary">{completedPrintRuns}/{totalPrintRuns} printruns</span>
        </div>
        <div className="w-full bg-muted rounded-full h-3 overflow-hidden">
          <div
            className="h-full bg-accent rounded-full transition-all duration-500 ease-out"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      <div className="flex justify-between text-sm mb-3">
        <span className="text-muted-foreground">Totaal producten</span>
        <span className="font-medium">{totalProducts}</span>
      </div>

      <div className="flex justify-between text-sm mb-3">
        <span className="text-muted-foreground">Platen afgerond</span>
        <span className="font-medium">{platesCompleted}/{totalPlates}</span>
      </div>

      {statuses.length > 0 && (
        <div className="flex flex-wrap gap-2" aria-label="Printstatus per plaat">
          {statuses.map((printed, index) => (
            <span
              key={index}
              className={`rounded-full px-2 py-1 text-xs ${
                printed
                  ? "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              Plaat {index + 1}: {printed ? "voltooid" : `moet nog ${runProgress[index].remaining}× geprint worden`}
            </span>
          ))}
        </div>
      )}

      {totalPlates > 0 && progressPercent >= 100 && (
        <div className="mt-3 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg p-2 text-center">
          <span className="text-sm text-green-700 dark:text-green-300 font-medium">✅ Alle platen zijn geprint!</span>
        </div>
      )}
    </div>
  );
}
