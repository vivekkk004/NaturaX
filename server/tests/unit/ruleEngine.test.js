import { describe, it, expect } from 'vitest';
import { buildRules, evaluate, evaluateOrder } from '../../src/rule-engine/engine.js';
import { RULE_CLASSES } from '../../src/rule-engine/registry.js';
import { addHours, istToDate } from '../../src/utils/dates.js';

const NOW = istToDate(2026, 10, 20, 18, 0); // fixed "current time": 20-10-2026 18:00 IST
const hoursAgo = (h) => addHours(NOW, -h);

const defaultConfigs = () =>
  RULE_CLASSES.map((R) => ({ ruleType: R.type, ...structuredClone(R.defaults) }));

const order = (overrides = {}) => ({
  orderId: 'ORD-1',
  dataStatus: 'VALID',
  status: 'CONFIRMED',
  orderDate: hoursAgo(1),
  orderValue: 1200,
  paymentType: 'COD',
  dispatchDate: null,
  expectedDeliveryDate: null,
  ...overrides,
});

const typesFor = (o, configs = defaultConfigs(), now = NOW) =>
  evaluateOrder(o, buildRules(configs), now).map((e) => e.ruleType);

describe('Rule 1 - unconfirmed > 2h', () => {
  it('flags only strictly more than the threshold', () => {
    expect(typesFor(order({ status: 'UNCONFIRMED', orderDate: hoursAgo(2) }))).toEqual([]);
    expect(typesFor(order({ status: 'UNCONFIRMED', orderDate: hoursAgo(2.02) }))).toEqual([
      'UNCONFIRMED_ORDER',
    ]);
  });

  it('builds a full exception: reason with numbers, priority, action, deadline', () => {
    const [ex] = evaluateOrder(
      order({ status: 'UNCONFIRMED', orderDate: hoursAgo(5.2) }),
      buildRules(defaultConfigs()),
      NOW,
    );
    expect(ex).toMatchObject({
      ruleType: 'UNCONFIRMED_ORDER',
      reason: 'Order unconfirmed for 5h 12m (limit 2h)',
      priority: 'MEDIUM',
    });
    expect(ex.actionRequired).toMatch(/Call the customer/);
    expect(ex.deadline).toEqual(addHours(NOW, 4));
  });
});

describe('Rule 2 - dispatch delay > 24h (configurable)', () => {
  const confirmed15h = order({ status: 'CONFIRMED', orderDate: hoursAgo(15) });

  it('does not flag a 15h-old confirmed order with the default 24h threshold', () => {
    expect(typesFor(confirmed15h)).toEqual([]);
    expect(typesFor(order({ orderDate: hoursAgo(25) }))).toEqual(['DISPATCH_DELAY']);
  });

  it('flags it once a manager changes the threshold to 12h - no code change', () => {
    const configs = defaultConfigs();
    configs.find((c) => c.ruleType === 'DISPATCH_DELAY').params.thresholdHours = 12;
    expect(typesFor(confirmed15h, configs)).toEqual(['DISPATCH_DELAY']);
  });
});

describe('Rule 3 - shipment delay', () => {
  it('flags a dispatched order past its expected delivery, not before', () => {
    const base = { status: 'DISPATCHED', orderDate: hoursAgo(80), dispatchDate: hoursAgo(70) };
    expect(typesFor(order({ ...base, expectedDeliveryDate: addHours(NOW, 1) }))).toEqual([]);
    expect(typesFor(order({ ...base, expectedDeliveryDate: hoursAgo(1) }))).toEqual([
      'SHIPMENT_DELAY',
    ]);
  });
});

describe('Rule 4 - failed delivery', () => {
  it('flags every failed delivery as HIGH priority', () => {
    const [ex] = evaluateOrder(
      order({ status: 'DELIVERY_FAILED', rawStatus: 'NDR', dispatchDate: hoursAgo(30) }),
      buildRules(defaultConfigs()),
      NOW,
    );
    expect(ex).toMatchObject({ ruleType: 'FAILED_DELIVERY', priority: 'HIGH' });
    expect(ex.reason).toContain('COD');
  });
});

describe('Rule 5 - high value (> ₹5,000) undelivered past expected date', () => {
  const late = {
    status: 'DISPATCHED',
    orderDate: hoursAgo(80),
    dispatchDate: hoursAgo(70),
    expectedDeliveryDate: hoursAgo(5),
  };

  it('raises BOTH shipment delay and high value for an expensive late parcel', () => {
    expect(typesFor(order({ ...late, orderValue: 7499 }))).toEqual([
      'SHIPMENT_DELAY',
      'HIGH_VALUE_DELAY',
    ]);
  });

  it('uses "more than": exactly ₹5,000 is not high value', () => {
    expect(typesFor(order({ ...late, orderValue: 5000 }))).toEqual(['SHIPMENT_DELAY']);
  });

  it('applies to any unfinished status, never to delivered or cancelled orders', () => {
    expect(typesFor(order({ ...late, status: 'DELIVERY_FAILED', orderValue: 9000 }))).toContain(
      'HIGH_VALUE_DELAY',
    );
    expect(typesFor(order({ ...late, status: 'DELIVERED', orderValue: 9000 }))).toEqual([]);
    expect(typesFor(order({ ...late, status: 'CANCELLED', orderValue: 9000 }))).toEqual([]);
  });

  it('does not judge an order without an expected delivery date', () => {
    expect(typesFor(order({ status: 'CONFIRMED', orderValue: 9000 }))).toEqual([]);
  });
});

describe('data quality and configuration', () => {
  it('never flags business rules on NEEDS_CORRECTION orders - only a data-correction task', () => {
    const bad = order({
      dataStatus: 'NEEDS_CORRECTION',
      status: 'DELIVERY_FAILED',
      dataIssues: [{ severity: 'ERROR', message: 'Phone Number "12345" is not valid' }],
    });
    const exceptions = evaluateOrder(bad, buildRules(defaultConfigs()), NOW);

    expect(exceptions.map((e) => e.ruleType)).toEqual(['DATA_CORRECTION']);
    expect(exceptions[0]).toMatchObject({ priority: 'LOW' });
    expect(exceptions[0].reason).toContain('Phone Number "12345"');
  });

  it('skips disabled rules entirely', () => {
    const configs = defaultConfigs();
    configs.find((c) => c.ruleType === 'FAILED_DELIVERY').enabled = false;
    expect(typesFor(order({ status: 'DELIVERY_FAILED' }), configs)).toEqual([]);
  });

  it('is deterministic: same orders + same now = same result', () => {
    const orders = [order({ status: 'UNCONFIRMED', orderDate: hoursAgo(3) }), order()];
    const rules = buildRules(defaultConfigs());
    expect(evaluate(orders, rules, NOW)).toEqual(evaluate(orders, rules, NOW));
  });

  it('lets time passing trigger a rule with no data change', () => {
    const o = order({ status: 'UNCONFIRMED', orderDate: hoursAgo(1) });
    expect(typesFor(o)).toEqual([]);
    expect(typesFor(o, defaultConfigs(), addHours(NOW, 1.5))).toEqual(['UNCONFIRMED_ORDER']);
  });

  it('every registered rule has valid default params', () => {
    for (const R of RULE_CLASSES) {
      expect(R.paramsSchema.strict().safeParse(R.defaults.params).success, R.type).toBe(true);
    }
  });
});
