// src/services/whatsapp.service.js
const { createSession, getSession, closeSession, sendMessageText, 
    sendMessageMedia, sendMessageDocument } = require("../whatsapp/sessionManager.js");

class WhatsappService {

    async init(companyId) {
        return await createSession(companyId);
    }

    async getQR(companyId) {
        const session = getSession(companyId);
        if (!session) {
            return { status: "DISCONNECTED", qr: null };
        }
        return { status: session.status, qr: session.qr };
    }

    async getStatus(companyId) {
        const session = getSession(companyId);
        if (!session) {
            return { status: "DISCONNECTED" };
        }

        return { status: session.status };
    }

    async logout(companyId) {
        return await closeSession(companyId);
    }

    async sendText(companyId, phone, message) {
        return await sendMessageText(companyId, phone, message);
    }

    async sendMedia(companyId, phone, base64, caption) {
        return await sendMessageMedia(companyId, phone, base64, caption);
    }

    async sendDocument(companyId, phone, base64, filename) {
        return await sendMessageDocument(companyId, phone, base64, filename);
    }
}

module.exports = new WhatsappService();
