// Template domain API bindings (Phase 8A). Local (non-Fabric) reads.

import { apiGet, unwrap } from './client.js';

const enc = encodeURIComponent;

export const templatesApi = {
  /** GET /api/templates → array of template summaries */
  async listTemplates() {
    const body = await apiGet('/templates');
    const list = unwrap(body, 'templates');
    return Array.isArray(list) ? list : [];
  },

  /** GET /api/templates/:templateId → latest template metadata */
  async getTemplate(templateId) {
    const body = await apiGet(`/templates/${enc(templateId)}`);
    return unwrap(body, 'template');
  },

  /** GET /api/templates/:templateId/:version → versioned template metadata */
  async getTemplateVersion(templateId, version) {
    const body = await apiGet(`/templates/${enc(templateId)}/${enc(version)}`);
    return unwrap(body, 'template');
  },
};
