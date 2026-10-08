'use strict';

/**
 * TESSERA External Source Adapter — ValuerAdapter
 *
 * Simulates an external certified valuation provider.
 * Architecture allows real provider to be plugged in without changing core logic.
 */
class ValuerAdapter {
  constructor() {
    this.name = 'Certified Valuation Authority Adapter';
    this.simulated = true;
  }

  /**
   * Estimates asset value based on asset type and attributes.
   * Deterministic for testing; replaceable with real API integration.
   *
   * @param {string} assetType - vehicle, land, grain
   * @param {object} attributes - Asset attributes from template
   * @returns {Promise<object>}
   */
  async estimateValue(assetType, attributes) {
    let estimatedValuation = 50000;
    let method = 'MARKET_COMPARABLE';
    let currency = 'USD';

    switch (assetType) {
      case 'vehicle':
        estimatedValuation = this._estimateVehicle(attributes);
        method = 'MARKET_COMPARABLE';
        break;
      case 'land':
        estimatedValuation = this._estimateLand(attributes);
        method = 'INDEPENDENT_APPRAISAL';
        break;
      case 'grain':
        estimatedValuation = this._estimateGrain(attributes);
        method = 'COMMODITY_SPOT_PRICE';
        break;
      default:
        estimatedValuation = 100000;
    }

    return {
      assetType,
      estimatedValuation,
      currency,
      appraiser: 'Global Asset Valuation & Advisory Board',
      method,
      valuationDate: new Date().toISOString().split('T')[0],
      validUntil: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      remarks: 'Independent appraisal estimate completed based on active market comparables',
    };
  }

  _estimateVehicle(attrs) {
    // Deterministic: base on year and manufacturer
    const year = parseInt(attrs.year, 10) || 2020;
    const base = 20000;
    const ageDepreciation = (new Date().getFullYear() - year) * 1500;
    return Math.max(base - ageDepreciation, 5000);
  }

  _estimateLand(attrs) {
    // Deterministic: base on area and location
    const area = parseFloat(attrs.areaSqFt) || 10000;
    const ratePerSqFt = attrs.location?.toLowerCase().includes('pune') ? 200 : 150;
    return area * ratePerSqFt;
  }

  _estimateGrain(attrs) {
    // Deterministic: base on quantity and grade
    const qty = parseFloat(attrs.quantity) || 100;
    const unit = attrs.unit || 'metric_ton';
    const gradeMultiplier = { PREMIUM: 300, A: 250, B: 200, STANDARD: 180, 'EXPORT_QUALITY': 320 };
    const multiplier = gradeMultiplier[attrs.grade] || 200;
    return qty * multiplier * (unit === 'metric_ton' ? 1 : unit === 'quintal' ? 0.1 : 0.045);
  }
}

module.exports = new ValuerAdapter();
