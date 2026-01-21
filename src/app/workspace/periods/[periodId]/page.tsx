export default function PeriodWorkspacePage({
  params,
}: {
  params: { periodId: string };
}) {
  return (
    <main className="workspace-placeholder">
      <h1>Period workspace</h1>
      <p className="helper">Period: {params.periodId}</p>
      <p className="helper">
        The period workspace is the next working slice.
      </p>
    </main>
  );
}
