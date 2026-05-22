// src/services/template.js

export async function parseTemplate(templateKey, params = {}) {
  switch (templateKey) {
    case "SALUDO_BASICO":
      return `Hola ${params.nombre || ""}, gracias por contactarnos.`;

    case "CODIGO_CONFIRMACION":
      return `Tu código de confirmación es: *${params.codigo || ""}*`;

    case "PAGO_CONFIRMADO":
      return `Estimado ${params.nombre || ""}, su pago por ${params.monto || ""} fue confirmado. ¡Gracias!`;

    default:
      if (params?.raw) {
        return params.raw;
      }

      throw new Error("Template no encontrado");
  }
}
