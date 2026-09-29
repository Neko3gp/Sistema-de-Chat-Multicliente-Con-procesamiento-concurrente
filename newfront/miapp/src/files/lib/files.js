const MAX_FILE_BYTES = 5 * 1024 * 1024;

export function getFileKind(filename = "", mimeType = "") {
  const name = filename.toLowerCase();
  const mime = mimeType.toLowerCase();

  if (mime.startsWith("image/") || /\.(png|jpe?g|gif|webp|bmp|svg)$/.test(name)) {
    return "image";
  }
  if (
    mime.startsWith("audio/") ||
    /\.(mp3|wav|ogg|m4a|aac|webm)$/.test(name)
  ) {
    return "audio";
  }
  return "document";
}

export function getMimeFromFilename(filename = "") {
  const name = filename.toLowerCase();
  if (/\.png$/.test(name)) return "image/png";
  if (/\.jpe?g$/.test(name)) return "image/jpeg";
  if (/\.gif$/.test(name)) return "image/gif";
  if (/\.webp$/.test(name)) return "image/webp";
  if (/\.mp3$/.test(name)) return "audio/mpeg";
  if (/\.wav$/.test(name)) return "audio/wav";
  if (/\.ogg$/.test(name)) return "audio/ogg";
  if (/\.m4a$/.test(name)) return "audio/mp4";
  if (/\.aac$/.test(name)) return "audio/aac";
  if (/\.webm$/.test(name)) return "audio/webm";
  if (/\.pdf$/.test(name)) return "application/pdf";
  if (/\.txt$/.test(name)) return "text/plain";
  return "application/octet-stream";
}

export function isPdfFile(filename = "", mimeType = "") {
  const mime = (mimeType || "").toLowerCase();
  const name = (filename || "").toLowerCase();
  return mime === "application/pdf" || /\.pdf$/.test(name);
}

export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    if (!file) {
      reject(new Error("Archivo vacío"));
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      reject(new Error("file_too_large"));
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      const base64 = result.includes(",") ? result.split(",")[1] : result;
      resolve(base64);
    };
    reader.onerror = () => reject(new Error("No se pudo leer el archivo"));
    reader.readAsDataURL(file);
  });
}

export function resolveFileMime(data, filename = "", mimeType = "") {
  // El nombre y el MIME del sistema pueden no coincidir con el contenido.
  // M4A usa una caja ftyp con la marca de audio "M4A ".
  try {
    const header = atob((data || "").slice(0, 32));
    if (header.slice(4, 8) === "ftyp" && header.slice(8, 12) === "M4A ") {
      return "audio/mp4";
    }
  } catch {
    // La validación del archivo completo corresponde al receptor.
  }
  const mime = (mimeType || "").trim().toLowerCase();
  if (mime === "audio/x-m4a" || mime === "audio/m4a") return "audio/mp4";
  if (!mime || mime === "application/octet-stream") return getMimeFromFilename(filename);
  return mime;
}

export function buildFileDataUrl(data, filename = "", mimeType = "") {
  if (!data) return null;
  const mime = resolveFileMime(data, filename, mimeType);
  return `data:${mime};base64,${data}`;
}

export function buildFileBlobUrl(data, filename = "", mimeType = "") {
  if (!data) return null;
  const mime = resolveFileMime(data, filename, mimeType);
  try {
    const binary = atob(data);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return URL.createObjectURL(new Blob([bytes], { type: mime }));
  } catch {
    return buildFileDataUrl(data, filename, mimeType);
  }
}

export function revokeBlobUrl(url) {
  if (typeof url === "string" && url.startsWith("blob:")) {
    URL.revokeObjectURL(url);
  }
}

export { MAX_FILE_BYTES };
