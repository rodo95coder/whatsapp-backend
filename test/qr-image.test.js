import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";

const { createScannableQr } = await import("../src/services/qr-image.js");

test("normaliza el QR a PNG blanco de alta resolución", async () => {
  const source = await sharp({
    create: { width: 24, height: 24, channels: 4, background: "#000000" },
  }).png().toBuffer();

  const result = await createScannableQr(`data:image/png;base64,${source.toString("base64")}`);
  const metadata = await sharp(Buffer.from(result.qrCode, "base64")).metadata();

  assert.equal(result.mimeType, "image/png");
  assert.equal(metadata.width, 900);
  assert.equal(metadata.height, 900);
});
