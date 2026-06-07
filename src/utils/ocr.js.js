import Tesseract from "tesseract.js";

export async function extractTextFromImage(file, onProgress) {
  if (!file) throw new Error("No image file provided.");
  const { data } = await Tesseract.recognize(file, "eng", {
    logger: (message) => {
      if (typeof onProgress === "function") onProgress(message);
    },
  });
  return {
    text: data?.text || "",
    confidence: Number(data?.confidence || 0),
  };
}