// src/services/whatsapp.service.js

import {
  initSession,
  getQR,
  getStatus,
  logout,
  sendMessage
} from "./session.service.js";

class WhatsappService {

  async init(companyId) {
    return await initSession(companyId);
  }

  async getQR(companyId) {
    const qr = getQR(companyId);
    const status = getStatus(companyId);
    return { status, qr };
  }

  async getStatus(companyId) {
    const status = getStatus(companyId);
    return { status };
  }

  async logout(companyId) {
    return await logout(companyId);
  }

  async sendText(companyId, phone, message) {
    return await sendMessage({
      companyId,
      numbers: [phone],
      text: message
    });
  }
}

export default new WhatsappService();