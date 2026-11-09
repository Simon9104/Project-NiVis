export function Toast({ text }: { text: string | null }) {
  if (!text) return null;
  return <div role="status" data-testid="toast" style="align-self: center; background: #1E2B33; color: #FFFFFF; border-radius: 14px; padding: 8px 14px; font-size: 12.5px; font-weight: 800; text-align: center; box-shadow: 0 6px 18px rgba(20,40,60,0.25); max-width: 100%">{text}</div>;
}
