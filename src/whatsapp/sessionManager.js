// src/whatsapp/session.manager.js
const sessions = new Map();

const createSession = async (companyId) => {
    // Si existe solo retornar
    if (sessions.has(companyId)) {
        return sessions.get(companyId);
    }

    const sessionObj = {
        companyId,
        status: "INITIALIZING",
        qr: null,
        client: null
    };

    sessions.set(companyId, sessionObj);

    // Aquí se implementa WPPConnect
    // Simulación placeholder:
    setTimeout(() => {
        sessionObj.status = "QR_READY";
        sessionObj.qr = "data:image/png;base64,QR_GENERADO_AQUI";
    }, 2000);

    return sessionObj;
};

const getSession = (companyId) => {
    return sessions.get(companyId);
};

const closeSession = async (companyId) => {
    if (!sessions.has(companyId)) return { status: "NO_SESSION" };

    sessions.delete(companyId);
    return { status: "LOGGED_OUT" };
};

const sendMessageText = async (companyId, phone, message) => {
    const session = getSession(companyId);
    if (!session || session.status !== "CONNECTED")
        return { error: "ERROR_SESSION_NOT_CONNECTED" };

    // Aquí iría client.sendText()
    return { status: "SENT", phone, message };
};

const sendMessageMedia = async (companyId, phone, base64, caption) => {
    const session = getSession(companyId);
    if (!session || session.status !== "CONNECTED")
        return { error: "ERROR_SESSION_NOT_CONNECTED" };

    return { status: "SENT", phone, caption };
};

const sendMessageDocument = async (companyId, phone, base64, filename) => {
    const session = getSession(companyId);
    if (!session || session.status !== "CONNECTED")
        return { error: "ERROR_SESSION_NOT_CONNECTED" };

    return { status: "SENT", phone, filename };
};

module.exports = {
    createSession,
    getSession,
    closeSession,
    sendMessageText,
    sendMessageMedia,
    sendMessageDocument
};
