type Bridge = {setFullscreen?: (on: boolean) => void};
/** Tam ekran oynatma → Windows penceresini de gerçek tam ekrana alır (Esc ile çıkılır). */
export function setImmersive(on: boolean): void {
  try {
    (window as unknown as {desktop?: Bridge}).desktop?.setFullscreen?.(on);
  } catch {
    /* yok say */
  }
}
