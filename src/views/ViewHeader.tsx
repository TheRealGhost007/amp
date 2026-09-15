import "./views.css";

export function ViewHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <header className="op-view__header">
      <h1 className="op-view__title">{title}</h1>
      {subtitle && <p className="op-view__subtitle">{subtitle}</p>}
    </header>
  );
}
