import type { ComponentChildren } from 'preact';

export const BTN_MAIN = "flex: 1; min-width: 160px; height: 50px; border-radius: 16px; border: none; background: #1A7A43; color: #FFFFFF; font-family: 'Fredoka', sans-serif; font-weight: 600; font-size: 17px; cursor: pointer; box-shadow: 0 4px 0 #0F5A2F";
export const BTN_SEC = "height: 50px; padding: 0 16px; border-radius: 16px; border: 2px solid #D5DFE3; background: #FFFFFF; color: #1E2B33; font-family: 'Fredoka', sans-serif; font-weight: 600; font-size: 15px; cursor: pointer";

export function Modal({ title, kicker, text, top, children }: { title: string; kicker: string; text: string; top?: ComponentChildren; children?: ComponentChildren }) {
  return (
    <div class="nv-modal" role="dialog" aria-modal="true" aria-label={title}>
      <div class="nv-modalcard">
        {top}
        <span style="font-size: 12px; font-weight: 800; color: #1A7A43; letter-spacing: 0.05em; text-transform: uppercase">{kicker}</span>
        <h2 style="margin: 0; font-family: 'Fredoka', sans-serif; font-weight: 600; font-size: 26px; line-height: 1.15">{title}</h2>
        <p style="margin: 0; font-size: 14px; line-height: 1.5; font-weight: 600; color: #33444D; white-space: pre-line">{text}</p>
        {children}
      </div>
    </div>
  );
}
