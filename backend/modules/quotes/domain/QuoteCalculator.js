const DEFAULT_OVERHEAD_RATE = 25;

function calculateQuote(input = {}) {
  const project = input.project || {};
  const configData = asArray(project.configData);
  const selections = asObject(input.selections || project.selections);
  const multiSel = asObject(input.multiSel || project.multiSel);
  const overheadRate = toNumber(input.overheadRate, DEFAULT_OVERHEAD_RATE);
  const overheadMultiplier = 1 + overheadRate / 100;

  const sections = [];
  let rawTotal = 0;

  for (const group of configData) {
    const selectedOptions = getSelectedOptions(group, selections, multiSel);
    if (!selectedOptions.length) continue;

    const options = selectedOptions.map(option => {
      const items = normalizeItems(option);
      const baseTotal = optionBaseTotal(option, items);
      const totalWithOverhead = baseTotal * overheadMultiplier;

      return {
        id: option.id || null,
        name: option.name || '',
        baseTotal,
        overheadRate,
        totalWithOverhead,
        items
      };
    });

    const sectionBaseTotal = options.reduce((sum, option) => sum + option.baseTotal, 0);
    const sectionTotalWithOverhead = options.reduce((sum, option) => sum + option.totalWithOverhead, 0);
    rawTotal += sectionTotalWithOverhead;

    sections.push({
      id: group.id || null,
      title: group.title || '',
      type: group.type || 'radio',
      baseTotal: sectionBaseTotal,
      overheadRate,
      totalWithOverhead: sectionTotalWithOverhead,
      options
    });
  }

  const vat = normalizeVat(input.vat);
  const vatAmount = vat ? rawTotal * vat.rate / 100 : 0;
  const totalWithVat = rawTotal + vatAmount;

  const discount = normalizeDiscount(input.discount);
  const discountBase = vat ? totalWithVat : rawTotal;
  const discountAmount = discount
    ? Math.min(discountBase, Math.max(0, discount.type === 'pct'
      ? discountBase * discount.value / 100
      : discount.value))
    : 0;

  const finalTotal = discountBase - discountAmount;

  return {
    sections,
    totals: {
      rawTotal,
      overheadRate,
      vatRate: vat ? vat.rate : 0,
      vatAmount,
      totalWithVat,
      discountType: discount ? discount.type : null,
      discountValue: discount ? discount.value : 0,
      discountAmount,
      finalTotal
    }
  };
}

function getSelectedOptions(group, selections, multiSel) {
  const options = asArray(group.options);

  if ((group.type || 'radio') === 'multi') {
    const selectedMap = asObject(multiSel[group.id]);
    return options.filter(option => selectedMap[option.id]);
  }

  const selectedId = selections[group.id];
  if (!selectedId) return [];

  const option = options.find(item => item.id === selectedId);
  return option ? [option] : [];
}

function normalizeItems(option) {
  return asArray(option.items).map(item => {
    const qty = toNumber(item.q, 1) || 1;
    const price = toNumber(item.p, 0);

    return {
      name: item.n || item.name || '',
      unit: item.u || item.unit || '',
      qty,
      price,
      total: qty * price
    };
  });
}

function optionBaseTotal(option, items) {
  if (items.length) {
    return items.reduce((sum, item) => sum + item.total, 0);
  }

  return toNumber(option.price, 0);
}

function normalizeVat(vat) {
  if (!vat) return null;
  const rate = toNumber(vat.rate, 0);
  return rate > 0 ? { rate } : null;
}

function normalizeDiscount(discount) {
  if (!discount) return null;

  const rawType = discount.type === 'sum' ? 'sum' : 'pct';
  const rawValue = discount.value !== undefined ? discount.value : discount.val;
  const value = toNumber(rawValue, 0);

  if (value <= 0) return null;
  return {
    type: rawType,
    value,
    client: typeof discount.client === 'string' ? discount.client.trim() : ''
  };
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      return [];
    }
  }
  return [];
}

function asObject(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch (error) {
      return {};
    }
  }
  return {};
}

function toNumber(value, fallback) {
  const numberValue = parseFloat(String(value ?? '').replace(',', '.'));
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

module.exports = {
  calculateQuote,
  DEFAULT_OVERHEAD_RATE
};
