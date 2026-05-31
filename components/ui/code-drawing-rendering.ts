const SVG_DATA_URL_PREFIX = 'data:image/svg+xml';
export const CODE_DRAWING_PREVIEW_MAX_HEIGHT = 'min(60vh, 520px)';

export function getCodeDrawingPreviewImageStyle() {
  return {
    maxHeight: `calc(${CODE_DRAWING_PREVIEW_MAX_HEIGHT} - 2rem)`,
  };
}

function decodeBase64Utf8(value: string) {
  if (typeof globalThis.atob !== 'function') {
    return '';
  }

  const binary = globalThis.atob(value);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));

  return new TextDecoder().decode(bytes);
}

function decodeSvgDataUrl(imageData: string) {
  const commaIndex = imageData.indexOf(',');

  if (commaIndex < 0) {
    return '';
  }

  const meta = imageData.slice(0, commaIndex);
  const data = imageData.slice(commaIndex + 1);

  try {
    if (meta.includes(';base64')) {
      return decodeBase64Utf8(data);
    }

    return decodeURIComponent(data);
  } catch {
    return '';
  }
}

export function isCodeDrawingErrorImage(imageData: string) {
  if (!imageData.startsWith(SVG_DATA_URL_PREFIX)) {
    return false;
  }

  const svgText = decodeSvgDataUrl(imageData);

  if (!svgText) {
    return false;
  }

  return (
    svgText.includes('class="error-text"') ||
    svgText.includes("class='error-text'") ||
    (svgText.includes('Syntax error in text') &&
      svgText.includes('mermaid version'))
  );
}
