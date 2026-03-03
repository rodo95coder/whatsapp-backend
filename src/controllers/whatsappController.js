// src/controllers/whatsappController.js
import sessionManager from '../services/session.service.js';
import fileService from '../services/file.js';
import { withTimeout } from '../utils/timeout.js';
import fs from 'fs';

// Función auxiliar para interpretar el ACK de WhatsApp
function getAckStatus(ack ,to ,ownNumber) {
  
  if (ownNumber && to === ownNumber) {
    return 'entregado'; // Mensaje a uno mismo siempre es "entregado"
  }

  const statusMap = {
    0: 'enviado',      // Enviado al servidor
    1: 'entregado',    // Entregado al dispositivo destino
    2: 'leído',        // Leído por el usuario
    3: 'fallido'       // Falló el envío
  };
  return statusMap[ack] || 'desconocido';
}

// Función para sanitizar la respuesta de un mensaje
function sanitizeMessageResponse(messageResponse,ownNumber = mull) {
  // Si no hay respuesta, retornar null
  if (!messageResponse) return null;

  // Extraer solo los campos relevantes
  return {
    messageId: messageResponse.id,
    to: messageResponse.to,
    timestamp: messageResponse.t,
    status: getAckStatus(messageResponse.ack, messageResponse.to, ownNumber),
    type: messageResponse.type,
    fromMe: messageResponse.fromMe
  };
}

// Función para extraer el número del remitente de varias fuentes posibles
function extractOwnNumber(client) {
  if (!client) return null;
  
  try {
    // Opción 1: client.info.wid._serialized
    if (client.info?.wid?._serialized) {
      return client.info.wid._serialized;
    }
    
    // Opción 2: client.info.wid (string directo)
    if (client.info?.wid && typeof client.info.wid === 'string') {
      return client.info.wid;
    }
    
    // Opción 3: client.info.me._serialized
    if (client.info?.me?._serialized) {
      return client.info.me._serialized;
    }
    
    // Opción 4: client.info.me (string directo)
    if (client.info?.me && typeof client.info.me === 'string') {
      return client.info.me;
    }
    
    // Opción 5: client.host (para algunas versiones)
    if (client.host?.number) {
      return `${client.host.number}@c.us`;
    }
    
    // Opción 6: Buscar en el objeto completo propiedades que contengan el número
    if (client.info) {
      const infoStr = JSON.stringify(client.info);
      const match = infoStr.match(/(\d+@c\.us)/);
      if (match) {
        return match[1];
      }
    }
    
    // Opción 7: Si el cliente tiene un método para obtener info
    if (typeof client.getHost === 'function') {
      const host = client.getHost();
      if (host && host.number) {
        return `${host.number}@c.us`;
      }
    }
    
  } catch (error) {
    console.warn('Error extrayendo número propio:', error.message);
  }
  
  return null;
}

// Función para determinar si un número es el propio
function isOwnNumber(number, ownNumber) {
  if (!ownNumber || !number) return false;
  
  // Normalizar ambos números (quitar @c.us para comparación)
  const normalizedNumber = number.split('@')[0];
  const normalizedOwn = ownNumber.split('@')[0];
  
  return normalizedNumber === normalizedOwn;
}

export const initSession = async (req, res) => {
  try {
    const companyId = req.cleanCompanyId;

    if (!companyId) {
      return res.status(400).json({
        success: false,
        message: "companyId requerido"
      });
    }

    const result = await withTimeout(
      sessionManager.initSession(companyId),
      20000
    );

    return res.json(result);

  } catch (e) {
    console.error(e);
    return res.status(500).json({
      success: false,
      message: e.message
    });
  }
};

export const getQR = (req, res) => {
  try {
    const companyId = req.cleanCompanyId;

    if (!companyId) {
      return res.status(400).json({ success: false, message: "companyId requerido" });
    }

    const qr = sessionManager.getQR(companyId);

    if (!qr) {
      return res.status(404).json({
        success: false,
        message: 'QR no disponible'
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
          companyId
        }
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
        expiresIn: 60 // 60 segundos típicos para QR de WhatsApp
      }
    });

  } catch (e) {
    return res.status(500).json({
      success: false,
      message: e.message
    });
  }
};

export const getStatus = (req, res) => {
  try {
    const companyId = req.cleanCompanyId;
    const status = sessionManager.getStatus(companyId);

    return res.json({
      success: true,
      status
    });

  } catch (e) {
    return res.status(500).json({
      success: false,
      message: e.message
    });
  }
};

export const send = async (req, res) => {
// Procesar archivo si existe
    let filePath = null;
  
    try {
      const companyId = req.cleanCompanyId;
      const { numbers, text, base64File, fileUrl, fileName } = req.body;

    // Validaciones
    if (!companyId) {
      return res.status(400).json({ message: "companyId requerido" });
    }

    if (!numbers || !Array.isArray(numbers)) {
      return res.status(400).json({ message: "numbers debe ser array" });
    }
    
    if (!text && !base64File && !fileUrl) {
      return res.status(400).json({ 
        success: false,
        message: "Debe proporcionar text, base64File o fileUrl" 
      });
    }

    // ESTADOS QUE CONSIDERAMOS "CONECTADO"
    const CONNECTED_STATES = ['CONNECTED', 'inChat', 'isLogged', 'NORMAL', 'MAIN'];

    // Validar estado de la sesión
    const status = sessionManager.getStatus(companyId);
    console.log('Status recibido:', status);  
    
    if (!CONNECTED_STATES.includes(status)) {   
      return res.status(400).json({
        success: false,
        message: "Sesión no conectada",
        currentStatus: status,
        companyId,
        //validStates: CONNECTED_STATES // Opcional: para debug
      });
    }
    // Obtener el número propio de la sesión
    let ownNumber = null;
    let ownNumberDetected = false;

    try {
      // Intentar acceder al cliente de varias formas
      const client = sessionManager.clients?.[companyId] || 
                     sessionManager[companyId] || 
                     sessionManager.getClient?.(companyId);
      
      if (client) {
        console.log(`[${companyId}] Cliente encontrado, tipo:`, typeof client);
        
        // Usar la función extractOwnNumber
        ownNumber = extractOwnNumber(client);
        
        if (ownNumber) {
          ownNumberDetected = true;
          console.log(`[${companyId}] Número propio detectado:`, ownNumber);
        } else {
          console.log(`[${companyId}] No se pudo detectar número propio del cliente`);
          
          // Opción de respaldo: extraer del primer mensaje enviado si existe
          // (Esto es útil cuando el cliente no expone el número pero podemos inferirlo)
        }
      } else {
        console.log(`[${companyId}] No se encontró cliente en sessionManager`);
        console.log('Keys disponibles:', Object.keys(sessionManager));
      }
    } catch (error) {
      console.warn(`[${companyId}] Error obteniendo número propio:`, error.message);
    }

    // Procesar archivo si existe
    if (base64File && fileName) {
      filePath = await fileService.saveBase64ToFile(base64File, fileName);
      console.log(`[${companyId}] Archivo guardado:`, filePath);
    } else if (fileUrl && fileName) {
      filePath = await fileService.downloadToFile(fileUrl, fileName);
      console.log(`[${companyId}] Archivo descargado:`, filePath);
    }

    // Enviar mensajes
    const result = await withTimeout(
      sessionManager.sendMessage({
        companyId,
        numbers,
        text,
        filePath,
        fileName
      }),
      30000
    );

    // Sanitizar resultados (usando isOwnNumber para determinar si es número propio)
    const sanitizedResults = result.results.map(item => {
      const baseResult = {
        number: item.number,
        success: item.success
      };

      if (item.success && item.response) {
        const messageResponse = sanitizeMessageResponse(item.response, ownNumber);
        
        // Si no se pudo detectar el número propio pero el número destino es el mismo que el remitente
        // y el mensaje es de uno mismo, asumimos que es un mensaje a uno mismo
        if (!ownNumberDetected && 
            item.response.fromMe && 
            isOwnNumber(item.response.to, item.response.from)) {
          messageResponse.status = 'entregado';
        }
        
        return {
          ...baseResult,
          ...messageResponse
        };
      } else if (item.error) {
        return {
          ...baseResult,
          error: item.error.message || 'Error desconocido'
        };
      }
      
      return baseResult;
    });

    // Contar éxitos y fallos
    const successful = sanitizedResults.filter(r => r.success).length;
    const failed = sanitizedResults.length - successful;

    // Limpiar archivo temporal si existe
    if (filePath) {
      try {
        fs.unlinkSync(filePath);
        console.log(`[${companyId}] Archivo temporal eliminado: ${filePath}`);
      } catch (error) {
        console.warn(`[${companyId}] No se pudo eliminar archivo temporal: ${error.message}`);
      }
    }

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
      results: sanitizedResults
    });

  } catch (e) {
    console.error(`[${req.cleanCompanyId || 'unknown'}] Error en send:`, e);
    
    if (filePath) {
      try { 
        fs.unlinkSync(filePath); 
      } catch (cleanupError) {
        // Ignorar error de limpieza
      }
    }

    return res.status(500).json({
      success: false,
      message: e.message || 'Error interno del servidor',
      error: process.env.NODE_ENV === 'development' ? e.stack : undefined
    });
  }
};

/* 
export const logout = async (req, res) => {
  try {
    const urlCompanyId = req.params.companyId; // El de la URL
    const bodyCompanyId = req.body.companyId;   // El del body (si existe)

    // Validación ESTRICTA: deben coincidir si body existe
    if (bodyCompanyId && bodyCompanyId !== urlCompanyId) {
      console.warn(`⚠️ Intento de logout inválido: URL=${urlCompanyId}, Body=${bodyCompanyId}`);
      
      return res.status(400).json({
        success: false,
        message: "El companyId de la URL no coincide con el del body",
        error: "COMPANY_ID_MISMATCH",
        details: {
            url: urlCompanyId,
            body: bodyCompanyId
        }
      });
    }

    // Si llegamos aquí, o no hay body o coinciden
    const companyId = urlCompanyId; // Usamos el de la URL siempre
    
    console.log(`[${companyId}] Procesando logout...`);

    const result = await withTimeout(
      sessionManager.logout(companyId),
      15000
    );

    return res.json({
      success: result.success,
      message: result.success 
        ? `Sesión ${companyId} cerrada exitosamente`
        : `Error al cerrar sesión ${companyId}: ${result.msg}`,
      companyId,
      data: result
    });

  } catch (e) {
    console.error(`[${req.params.companyId}] Error en logout:`, e);
    return res.status(500).json({
      success: false,
      message: e.message,
      companyId: req.params.companyId
    });
  }
}; */

// src/controllers/whatsappController.js
export const logout = async (req, res) => {
  try {
    const urlCompanyId = req.params.companyId; // El de la URL
    const bodyCompanyId = req.body.companyId;   // El del body (si existe)

    // CASO 1: Hay body con companyId DIFERENTE a la URL → ERROR
    if (bodyCompanyId && bodyCompanyId !== urlCompanyId) {
      console.warn(`Logout rechazado: URL=${urlCompanyId}, Body=${bodyCompanyId} no coinciden`);
      
      return res.status(400).json({
        success: false,
        message: "El companyId de la URL no coincide con el del body",
        error: "COMPANY_ID_MISMATCH",
        details: {
          url: urlCompanyId,
          body: bodyCompanyId
        },
        suggestion: "Para hacer logout, usa el mismo companyId en URL y body, o no envíes body"
      });
    }

    // CASO 2: No hay body O body coincide con URL → Proceder con logout
    const companyId = urlCompanyId; // Siempre usamos la URL
    
    console.log(`[${companyId}] Procesando logout...`);

    const result = await withTimeout(
      sessionManager.logout(companyId),
      15000
    );

    return res.json({
      success: result.success,
      message: result.success 
        ? `Sesión ${companyId} cerrada exitosamente`
        : `Error al cerrar sesión ${companyId}: ${result.msg}`,
      companyId,
      data: result
    });

  } catch (e) {
    console.error(`[${req.params.companyId}] Error en logout:`, e);
    return res.status(500).json({
      success: false,
      message: e.message,
      companyId: req.params.companyId
    });
  }
};