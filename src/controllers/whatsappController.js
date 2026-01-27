// src/controllers/whatsappController.js
import sessionManager from '../services/session-manager.js';
import fileService from '../services/file.js';

export const initSession = async (req, res) => {
  const { companyId } = req.body;
  try {
    const r = await sessionManager.initSession(companyId);
    res.json(r);
  } catch (e) {
    res.status(500).json({ success: false, msg: e.message });
  }
};

export const getQR = (req, res) => {
  const { companyId } = req.params;
  try {
    const qr = sessionManager.getQR(companyId);
    if (!qr) return res.status(404).json({ success: false, msg: 'QR not available' });
    res.json({ success: true, qr });
  } catch (e) {
    res.status(500).json({ success: false, msg: e.message });
  }
};

export const getStatus = async (req, res) => {
  const { companyId } = req.params;
  try {
    const r = await sessionManager.getStatus(companyId);
    res.json({ success: true, status: r });
  } catch (e) {
    res.status(500).json({ success: false, msg: e.message });
  }
};

export const send = async (req, res) => {
  const { companyId } = req.params;
  const { numbers, text, base64File, fileUrl, fileName } = req.body;
  try {
    let filePath = null;
    if (base64File && fileName) {
      filePath = await fileService.saveBase64ToFile(base64File, fileName);
    } else if (fileUrl && fileName) {
      filePath = await fileService.downloadToFile(fileUrl, fileName);
    }

    const r = await sessionManager.sendMessage({ 
      companyId, 
      numbers, 
      text, 
      filePath, 
      fileName 
    });

    if (filePath) { 
      try { 
        const fs = await import('fs');
        fs.unlinkSync(filePath);
      } catch (e) {} 
    }
    
    res.json(r);
  } catch (e) {
    res.status(500).json({ success: false, msg: e.message });
  }
};

export const logout = async (req, res) => {
  const { companyId } = req.params;
  try {
    const r = await sessionManager.logout(companyId);
    res.json(r);
  } catch (e) {
    res.status(500).json({ success: false, msg: e.message });
  }
};