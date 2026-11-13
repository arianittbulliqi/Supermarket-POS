/** A receipt QR code as SVG, sized by the paper or the screen it goes on. */
import qrcode from 'qrcode-generator';

export function qrSvg(text: string): string {
  const q = qrcode(0, 'M');
  q.addData(text, 'Byte');
  q.make();
  return q.createSvgTag({ cellSize: 2, margin: 2, scalable: true });
}
