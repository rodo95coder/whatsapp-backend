/**
 * template.service.js
 * Generación simple de plantillas tipo Migo para envío homogéneo
 */

export async function parseTemplate(templateKey, params = {}) {
  switch (templateKey) {
    case "SALUDO_BASICO":
      return `Hola ${params.nombre}, gracias por contactarnos.`;

    case "CODIGO_CONFIRMACION":
      return `Tu código de confirmación es: *${params.codigo}*`;

    case "PAGO_CONFIRMADO":
      return `Estimado ${params.nombre}, su pago por ${params.monto} fue confirmado. ¡Gracias!`;

    default:
      return params?.raw || ""; // fallback texto plano
  }
}