export async function preparePhoto(file, {
  maxSize = 8 * 1024 * 1024,
  maxDimension = 1280,
  quality = 0.72,
} = {}) {
  if (!file) {
    const error = new Error("NO_FILE");
    error.code = "NO_FILE";
    throw error;
  }

  if (!file.type.startsWith("image/")) {
    const error = new Error("INVALID_TYPE");
    error.code = "INVALID_TYPE";
    throw error;
  }

  if (file.size > maxSize) {
    const error = new Error("FILE_TOO_LARGE");
    error.code = "FILE_TOO_LARGE";
    throw error;
  }

  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error("READ_FAILED"));
    reader.readAsDataURL(file);
  });

  const image = await new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("IMAGE_LOAD_FAILED"));
    img.src = dataUrl;
  });

  const scale = Math.min(
    1,
    maxDimension / Math.max(image.width, image.height)
  );

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(image.width * scale);
  canvas.height = Math.round(image.height * scale);

  const context = canvas.getContext("2d");
  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  return canvas.toDataURL("image/jpeg", quality);
}

