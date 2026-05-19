// src/services/message/message-utils.js

// Función auxiliar para interpretar el ACK de WhatsApp
export function getAckStatus(ack, to, ownNumber) {
  if (ownNumber && to === ownNumber) {
    return "entregado"; // Mensaje a uno mismo siempre es "entregado"
  }

  const statusMap = {
    0: "enviado", // Enviado al servidor
    1: "entregado", // Entregado al dispositivo destino
    2: "leído", // Leído por el usuario
    3: "fallido", // Falló el envío
  };
  return statusMap[ack] || "desconocido";
}

// Función para sanitizar la respuesta de un mensaje
export function sanitizeMessageResponse(messageResponse, ownNumber = null) {
  // Si no hay respuesta, retornar null
  if (!messageResponse) return null;

  // Extraer solo los campos relevantes
  return {
    messageId: messageResponse.id,
    to: messageResponse.to,
    timestamp: messageResponse.t,
    status: getAckStatus(messageResponse.ack, messageResponse.to, ownNumber),
    type: messageResponse.type,
    fromMe: messageResponse.fromMe,
  };
}

// Función para extraer el número del remitente de varias fuentes posibles
export function extractOwnNumber(client) {
  if (!client) return null;

  try {
    // Opción 1: client.info.wid._serialized
    if (client.info?.wid?._serialized) {
      return client.info.wid._serialized;
    }

    // Opción 2: client.info.wid (string directo)
    if (client.info?.wid && typeof client.info.wid === "string") {
      return client.info.wid;
    }

    // Opción 3: client.info.me._serialized
    if (client.info?.me?._serialized) {
      return client.info.me._serialized;
    }

    // Opción 4: client.info.me (string directo)
    if (client.info?.me && typeof client.info.me === "string") {
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
    if (typeof client.getHost === "function") {
      const host = client.getHost();
      if (host && host.number) {
        return `${host.number}@c.us`;
      }
    }
  } catch (error) {
    console.warn("Error extrayendo número propio:", error.message);
  }

  return null;
}

// Función para determinar si un número es el propio
export function isOwnNumber(number, ownNumber) {
  if (!ownNumber || !number) return false;

  // Normalizar ambos números (quitar @c.us para comparación)
  const normalizedNumber = number.split("@")[0];
  const normalizedOwn = ownNumber.split("@")[0];

  return normalizedNumber === normalizedOwn;
}
