export function FieldError({ children }: { children?: string }) {
  if (!children) return null;
  return <p className="mt-1.5 text-xs font-medium text-rose-600">{children}</p>;
}

