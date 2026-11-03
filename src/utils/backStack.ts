/**
 * Android geri tuşu için basit yığın: alt ekranlar (ör. kategori klasörü, tam ekran)
 * geri işleyicisini buraya kaydeder; App en üsttekini önce çalıştırır.
 */
type Handler = () => void;
const stack: Handler[] = [];

export function registerBack(fn: Handler): () => void {
  stack.push(fn);
  return () => {
    const i = stack.lastIndexOf(fn);
    if (i >= 0) {
      stack.splice(i, 1);
    }
  };
}

/** Bir işleyici varsa çalıştırır ve true döner. */
export function runBack(): boolean {
  const fn = stack[stack.length - 1];
  if (!fn) {
    return false;
  }
  fn();
  return true;
}
