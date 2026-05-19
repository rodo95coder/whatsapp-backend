// src/services/message.service.js

 export async function sendMessage(
  
  
  
  
  
) {
/*   if (getQueueSize(companyId) > 1000) {
    throw new Error("Queue overloaded");
  }

  return enqueueMessage(companyId, async () => {
    const runtime = store.getRuntime(companyId);

    if (!runtime) {
      throw new Error("Session runtime not found");
    }

    if (runtime.destroying) {
      throw new Error("Session destroying");
    }

    if (runtime.creating) {
      throw new Error("Session initializing");
    }

    if (runtime.reconnectTimer) {
      throw new Error("Session reconnecting");
    }

    const client = runtime.client;

    if (!client) {
      throw new Error("Session not active");
    }

    const status = getSessionStatus(companyId);

    if (!CONNECTED_STATES.includes(status)) {
      throw new Error(`Session not connected (${status})`);
    }

    const results = [];

    for (const number of numbers) {
      try {
        logger.info(`[${companyId}] Enviando mensaje a ${number}`);

        let response;

        if (filePath) {
          response = await withTimeout(
            client.sendFile(number, filePath, fileName || "file", text),
            15000,
          );
        } else {
          response = await withTimeout(client.sendText(number, text), 15000);
        }

        results.push({
          number,
          success: true,
          response,
        });
      } catch (err) {
        logger.error(
          `[${companyId}] Error enviando a ${number}: ${err.message}`,
        );

        results.push({
          number,
          success: false,
          error: err.message,
        });
      }
    }

    return {
      success: true,
      results,
    };
  }); */
} 
