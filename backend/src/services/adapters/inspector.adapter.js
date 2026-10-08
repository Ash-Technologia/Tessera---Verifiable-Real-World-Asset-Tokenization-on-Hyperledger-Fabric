'use strict';

/**
 * TESSERA External Source Adapter — InspectorAdapter
 *
 * Lightweight interface/adapter for licensed physical inspection attestations.
 */
class InspectorAdapter {
  constructor() {
    this.name = 'Physical Inspection Adapter';
    this.simulated = true;
  }

  async verifyInspection(reportId, assetId) {
    return {
      verified: true,
      reportId: reportId || `INSP-${assetId}`,
      inspectorAgency: 'Bureau Veritas Technical Inspection Services',
      conditionGrade: 'GRADE-A / EXCELLENT',
      inspectionPassed: true,
      remarks: 'Physical inspection completed on-site. Asset matches registration details.',
    };
  }
}

module.exports = new InspectorAdapter();
