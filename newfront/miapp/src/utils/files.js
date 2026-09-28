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
  if (/\.pdf$/.test(name)) return "application/pdf";
  return "application/octet-stream";
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

export function buildFileDataUrl(data, filename = "", mimeType = "") {
  if (!data) return null;
  const mime = mimeType || getMimeFromFilename(filename);
  return `data:${mime};base64,${data}`;
}

export { MAX_FILE_BYTES };
