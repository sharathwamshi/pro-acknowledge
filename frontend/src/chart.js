// Download any DOM node (a chart card) as a PNG image.
import { toPng } from "html-to-image";

export async function downloadNodePng(node, filename = "chart.png") {
  if (!node) return;
  const dataUrl = await toPng(node, {
    pixelRatio: 2,
    backgroundColor: "#ffffff",
    // Skip any element marked data-noexport (e.g. the download button itself).
    filter: (el) => !(el.dataset && el.dataset.noexport),
  });
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  a.click();
}
