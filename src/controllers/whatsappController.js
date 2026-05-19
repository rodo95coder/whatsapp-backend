// src/controllers/whatsappController.js
import sessionManager from "../services/session.service.js";
import { withTimeout } from "../utils/timeout.js";
import {
  extractOwnNumber,
  sanitizeMessageResponse,
  isOwnNumber,
} from "../services/message/message-utils.js";
import fs from "fs";

export const initSession = async (req, res) => {
  try {
    const companyId = req.cleanCompanyId;

    if (!companyId) {
      return res.status(400).json({
        success: false,
        message: "companyId requerido",
      });
    }

    const result = await sessionManager.initSession(companyId);

    return res.json(result);
  } catch (e) {
    console.error(e);
    return res.status(500).json({
      success: false,
      message: e.message,
    });
  }
};

export const getQR = (req, res) => {
  try {
    const companyId = req.cleanCompanyId;

    if (!companyId) {
      return res
        .status(400)
        .json({ success: false, message: "companyId requerido" });
    }

    const qr = sessionManager.getQR(companyId);

    if (!qr) {
      return res.status(404).json({
        success: false,
        message: "QR no disponible",
      });
    }

    // Extraer el base64 puro (sin el prefijo data:image/png;base64,)
    const base64Match = qr.match(/^data:image\/([a-zA-Z]+);base64,(.+)$/);

    if (!base64Match) {
      // Si no tiene el formato esperado, devolver como viene
      return res.json({
        success: true,
        data: {
          qrCode: qr,
          companyId,
        },
      });
    }

    const format = base64Match[1]; // png, jpeg, etc
    const pureBase64 = base64Match[2]; // Solo el base64

    return res.json({
      success: true,
      data: {
        qrCode: pureBase64,
        format: format,
        mimeType: `image/${format}`,
        companyId: companyId,
        timestamp: Date.now(),
        expiresIn: 60, // 60 segundos típicos para QR de WhatsApp
      },
    });
  } catch (e) {
    return res.status(500).json({
      success: false,
      message: e.message,
    });
  }
};

export const getStatus = (req, res) => {
  try {
    const companyId = req.cleanCompanyId;
    const status = sessionManager.getStatus(companyId);

    const CONNECTED_STATES = ["CONNECTED"];

    if (!CONNECTED_STATES.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Sesión no conectada",
        currentStatus: status,
      });
    }

    return res.json({
      success: true,
      status,
    });
  } catch (e) {
    return res.status(500).json({
      success: false,
      message: e.message,
    });
  }
};

export const send = async (req, res) => {
  // Procesar archivo si existe
  let filePath = null;

  try {
    const companyId = req.cleanCompanyId;
    const { numbers, text, fileName } = req.body;

    // Validar estado de la sesión
    const status = sessionManager.getStatus(companyId);
    console.log("Status recibido:", status);

    // Obtener el número propio de la sesión
    let ownNumber = null;
    let ownNumberDetected = false;

    try {
      // Intentar acceder al cliente de varias formas
      const client = sessionManager.getClient(companyId);

      if (client) {
        console.log(`[${companyId}] Cliente encontrado, tipo:`, typeof client);

        // Usar la función extractOwnNumber
        ownNumber = extractOwnNumber(client);

        if (ownNumber) {
          ownNumberDetected = true;
          console.log(`[${companyId}] Número propio detectado:`, ownNumber);
        } else {
          console.log(
            `[${companyId}] No se pudo detectar número propio del cliente`,
          );

          // Opción de respaldo: extraer del primer mensaje enviado si existe
          // (Esto es útil cuando el cliente no expone el número pero podemos inferirlo)
        }
      } else {
        console.log(`[${companyId}] No se encontró cliente en sessionManager`);
        console.log("Keys disponibles:", Object.keys(sessionManager));
      }
    } catch (error) {
      console.warn(
        `[${companyId}] Error obteniendo número propio:`,
        error.message,
      );
    }

    // Enviar mensajes
    const result = await withTimeout(
      sessionManager.sendMessage({
        companyId,
        numbers,
        text,
        filePath,
        fileName,
      }),
      30000,
    );

    // Sanitizar resultados (usando isOwnNumber para determinar si es número propio)
    const sanitizedResults = result.results.map((item) => {
      const baseResult = {
        number: item.number,
        success: item.success,
      };

      if (item.success && item.response) {
        const messageResponse = sanitizeMessageResponse(
          item.response,
          ownNumber,
        );

        // Si no se pudo detectar el número propio pero el número destino es el mismo que el remitente
        // y el mensaje es de uno mismo, asumimos que es un mensaje a uno mismo
        if (
          !ownNumberDetected &&
          item.response.fromMe &&
          isOwnNumber(item.response.to, item.response.from)
        ) {
          messageResponse.status = "entregado";
        }

        return {
          ...baseResult,
          ...messageResponse,
        };
      } else if (item.error) {
        return {
          ...baseResult,
          error: item.error.message || "Error desconocido",
        };
      }

      return baseResult;
    });

    // Contar éxitos y fallos
    const successful = sanitizedResults.filter((r) => r.success).length;
    const failed = sanitizedResults.length - successful;

    return res.json({
      success: true,
      message: `Mensajes procesados: ${sanitizedResults.length} (${successful} exitosos, ${failed} fallidos)`,
      summary: {
        total: sanitizedResults.length,
        successful,
        failed,
        companyId,
        ownNumberDetected,
      },
      results: sanitizedResults,
    });
  } catch (e) {
    console.error(`[${req.cleanCompanyId || "unknown"}] Error en send:`, e);

    if (filePath) {
      try {
        fs.unlinkSync(filePath);
      } catch (cleanupError) {
        // Ignorar error de limpieza
      }
    }

    return res.status(500).json({
      success: false,
      message: e.message || "Error interno del servidor",
      error: process.env.NODE_ENV === "development" ? e.stack : undefined,
    });
  }
};

export const logout = async (req, res) => {
  try {
    const urlCompanyId = req.params.companyId; // El de la URL
    const bodyCompanyId = req.body.companyId; // El del body (si existe)

    // CASO 1: Hay body con companyId DIFERENTE a la URL → ERROR
    if (bodyCompanyId && bodyCompanyId !== urlCompanyId) {
      console.warn(
        `Logout rechazado: URL=${urlCompanyId}, Body=${bodyCompanyId} no coinciden`,
      );

      return res.status(400).json({
        success: false,
        message: "El companyId de la URL no coincide con el del body",
        error: "COMPANY_ID_MISMATCH",
        details: {
          url: urlCompanyId,
          body: bodyCompanyId,
        },
        suggestion:
          "Para hacer logout, usa el mismo companyId en URL y body, o no envíes body",
      });
    }

    // CASO 2: No hay body O body coincide con URL → Proceder con logout
    const companyId = urlCompanyId; // Siempre usamos la URL

    console.log(`[${companyId}] Procesando logout...`);

    const result = await withTimeout(
      sessionManager.logout(companyId, { full: true }),
      15000,
    );

    return res.json({
      success: result.success,
      message: result.success
        ? `Sesión ${companyId} cerrada exitosamente`
        : `Error al cerrar sesión ${companyId}: ${result.msg}`,
      companyId,
      data: result,
    });
  } catch (e) {
    console.error(`[${req.params.companyId}] Error en logout:`, e);
    return res.status(500).json({
      success: false,
      message: e.message,
      companyId: req.params.companyId,
    });
  }
};
