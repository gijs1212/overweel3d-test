interface PrintProgressProps {
  partsTotal: number;
  partsPerPlate: number;
  platesCompleted: number;
}

export function PrintProgress({ partsTotal, partsPerPlate, platesCompleted }: PrintProgressProps) {
  if (!partsTotal || partsTotal === 0) return null;

  const totalPlates = Math.ceil(partsTotal / partsPerPlate);
  const partsCompleted = Math.min(platesCompleted * partsPerPlate, partsTotal);
  const progressPercent = (partsCompleted / partsTotal) * 100;

  return (
    <div className="bg-card rounded-2xl p-6 shadow-sm border border-border/50">
      <h3 className="font-bold text-primary mb-4">🖨️ Printvoortgang</h3>
      
      <div className="mb-3">
        <div className="flex justify-between text-sm mb-1">
          <span className="text-muted-foreground">Voortgang</span>
          <span className="font-medium text-primary">{partsCompleted}/{partsTotal} onderdelen</span>
        </div>
        <div className="w-full bg-muted rounded-full h-3 overflow-hidden">
          <div
            className="h-full bg-accent rounded-full transition-all duration-500 ease-out"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">Platen voltooid</span>
        <span className="font-medium">{platesCompleted}/{totalPlates}</span>
      </div>

      {progressPercent >= 100 && (
        <div className="mt-3 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg p-2 text-center">
          <span className="text-sm text-green-700 dark:text-green-300 font-medium">✅ Alle onderdelen geprint!</span>
        </div>
      )}
    </div>
  );
}
