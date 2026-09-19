import { COUNTRIES } from '../app/lib/country/countries.js';
import { localNotificationTime, notificationHour } from '../app/lib/notification-time.js';
import { annualSavings } from '../app/lib/billing.js';

test('hour validation keeps midnight and falls back to 10 for absent or invalid values',()=>{
  for(const value of [undefined,null,'10','',-1,24,2.5,NaN])expect(notificationHour(value)).toBe(10);
  for(let hour=0;hour<24;hour++)expect(notificationHour(hour)).toBe(hour);
});
test.each(COUNTRIES)('$code has an explicit valid civil timezone',country=>{
  const clock=localNotificationTime(Date.parse('2026-07-01T12:00Z'),country.code);
  expect(clock.timezone).toBe(country.timezone);expect(clock.day).toMatch(/^2026-07-0[12]$/);
  expect(clock.hour).toBeGreaterThanOrEqual(0);expect(clock.hour).toBeLessThan(24);
});
test('funding country, summer/winter offsets, and midnight determine the due time',()=>{
  expect(localNotificationTime(Date.parse('2026-07-01T06:59Z'),'BG',10).due).toBe(false);
  expect(localNotificationTime(Date.parse('2026-07-01T07:00Z'),'BG',10).due).toBe(true);
  expect(localNotificationTime(Date.parse('2026-01-01T07:59Z'),'BG',10).due).toBe(false);
  expect(localNotificationTime(Date.parse('2026-01-01T08:00Z'),'BG',10).due).toBe(true);
  expect(localNotificationTime(Date.parse('2026-07-01T07:00Z'),'PT',10).due).toBe(false);
  expect(localNotificationTime(Date.parse('2026-07-01T22:00Z'),'BG',0)).toMatchObject({day:'2026-07-02',hour:1,due:true});
});
test('spring missing hour catches up and autumn repeated hour keeps the same daily key',()=>{
  expect(localNotificationTime(Date.parse('2026-03-29T01:00Z'),'DE',2)).toMatchObject({hour:3,due:true});
  const first=localNotificationTime(Date.parse('2026-10-25T00:30Z'),'DE',2);
  const second=localNotificationTime(Date.parse('2026-10-25T01:30Z'),'DE',2);
  expect(first).toEqual(second);expect(first.due).toBe(true);
});
test('annual saving uses configured minor units and never invents a discount',()=>{
  const monthly={billing_interval:'month',amount:725,currency:'eur'};
  const annual={billing_interval:'year',amount:7100,currency:'eur'};
  expect(annualSavings([monthly,annual],annual)).toMatchObject({amount:1600,currency:'eur'});
  expect(annualSavings([monthly],annual).percent).toBeCloseTo(1600/8700*100);
  for(const candidate of [{...annual,amount:8700},{...annual,amount:9000},{...annual,currency:'usd'},{...annual,amount:null}])expect(annualSavings([monthly],candidate)).toBeNull();
  expect(annualSavings([],annual)).toBeNull();expect(annualSavings([monthly,monthly],annual)).toBeNull();
  expect(annualSavings([{...monthly,amount:Number.MAX_SAFE_INTEGER}],annual)).toBeNull();
});
