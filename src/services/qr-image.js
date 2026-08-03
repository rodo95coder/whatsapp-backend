import sharp from "sharp";

const DISPLAY_SIZE = 900;
const QUIET_ZONE = 72;
const QR_CONTENT_SIZE = DISPLAY_SIZE - (QUIET_ZONE * 2);

export async function createScannableQr(base64Qr) {
  const value = String(base64Qr);
  const raw = value.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, "");
  const input = Buffer.from(raw, "base64");

  const png = await sharp(input)
    .ensureAlpha()
    .flatten({ background: "#ffffff" })
    .extend({
      top: QUIET_ZONE,
      bottom: QUIET_ZONE,
      left: QUIET_ZONE,
      right: QUIET_ZONE,
      background: "#ffffff",
    })
    .resize({
      width: QR_CONTENT_SIZE,
      height: QR_CONTENT_SIZE,
      fit: "contain",
      kernel: sharp.kernel.nearest,
      background: "#ffffff",
    })
    .png({ compressionLevel: 9, palette: true })
    .toBuffer();

  return {
    qrCode: png.toString("base64"),
    mimeType: "image/png",
    width: DISPLAY_SIZE,
    height: DISPLAY_SIZE,
  };
}
