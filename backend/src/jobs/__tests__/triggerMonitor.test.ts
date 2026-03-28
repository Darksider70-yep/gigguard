jest.mock('../../db', () => ({
  query: jest.fn(),
  withTransaction: jest.fn(),
}));

jest.mock('../../services/weatherService', () => ({
  weatherService: {
    getCurrentConditions: jest.fn(),
    getAQI: jest.fn(),
    getWeatherMultiplier: jest.fn(),
  },
}));

jest.mock('../../queues', () => ({
  claimCreationQueue: { add: jest.fn() },
  claimValidationQueue: { add: jest.fn() },
  payoutQueue: { add: jest.fn() },
  redisConnection: {},
}));

import { query } from '../../db';
import { weatherService } from '../../services/weatherService';
import { claimCreationQueue } from '../../queues';
import { processTriggerEvent, runTriggerCycle } from '../triggerMonitor';
import { latLngToCell } from 'h3-js';

const mockQuery = query as jest.MockedFunction<typeof query>;
const mockWeatherService = weatherService as jest.Mocked<typeof weatherService>;
const mockClaimCreationQueue = claimCreationQueue as jest.Mocked<typeof claimCreationQueue>;

describe('triggerMonitor job', () => {
  const eventLat = 19.1136;
  const eventLng = 72.8697;
  const eventHex = latLngToCell(eventLat, eventLng, 8);
  const eventHexBigintString = BigInt(`0x${eventHex}`).toString();

  beforeEach(() => {
    jest.clearAllMocks();
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
    mockWeatherService.getCurrentConditions.mockResolvedValue({
      weather_multiplier: 1.2,
      rain_1h: 18,
      feels_like: 35,
      temp: 31,
      aqi: null,
    });
    mockWeatherService.getAQI.mockResolvedValue(null);
    (mockClaimCreationQueue.add as jest.Mock).mockResolvedValue({ id: 'job-1' });
  });

  test('runTriggerCycle skips zones with no active policies', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    await runTriggerCycle();

    expect(mockWeatherService.getCurrentConditions).not.toHaveBeenCalled();
    expect(mockClaimCreationQueue.add).not.toHaveBeenCalled();
  });

  test('runTriggerCycle suppresses duplicates within 6-hour window', async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [{ home_hex_id: eventHexBigintString, city: 'Mumbai' }],
        rowCount: 1,
      })
      .mockResolvedValueOnce({ rows: [{ id: 'existing-event' }], rowCount: 1 });
    mockWeatherService.getAQI.mockResolvedValue(null);

    await runTriggerCycle();

    expect(mockClaimCreationQueue.add).not.toHaveBeenCalled();
  });

  test('processTriggerEvent uses gridDisk(eventHex, 1) - exactly 7 hexes in ring', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [{ id: 'worker-1' }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ id: 'event-1' }], rowCount: 1 });

    const result = await processTriggerEvent({
      trigger_type: 'heavy_rainfall',
      city: 'Mumbai',
      lat: eventLat,
      lng: eventLng,
      trigger_value: 20,
      disruption_hours: 4,
    });

    expect(result.affected_hex_ids).toHaveLength(7);
  });

  test('processTriggerEvent only workers inside k=1 ring are included in job', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [{ id: 'inside-worker' }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ id: 'event-1' }], rowCount: 1 });

    await processTriggerEvent({
      trigger_type: 'heavy_rainfall',
      city: 'Mumbai',
      lat: eventLat,
      lng: eventLng,
      trigger_value: 20,
      disruption_hours: 4,
    });

    expect(mockClaimCreationQueue.add).toHaveBeenCalledWith(
      'create-claims',
      expect.objectContaining({ worker_ids: ['inside-worker'] }),
      expect.any(Object)
    );
  });

  test('processTriggerEvent workers outside k=1 ring are excluded', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [{ id: 'inside-worker' }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ id: 'event-1' }], rowCount: 1 });

    await processTriggerEvent({
      trigger_type: 'heavy_rainfall',
      city: 'Mumbai',
      lat: eventLat,
      lng: eventLng,
      trigger_value: 20,
      disruption_hours: 4,
    });

    const payload = (mockClaimCreationQueue.add as jest.Mock).mock.calls[0][1];
    expect(payload.worker_ids).toEqual(['inside-worker']);
    expect(payload.worker_ids).not.toContain('outside-worker');
  });

  test('processTriggerEvent creates disruption_event with correct severity', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [{ id: 'worker-1' }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ id: 'event-1' }], rowCount: 1 });

    await processTriggerEvent({
      trigger_type: 'heavy_rainfall',
      city: 'Mumbai',
      lat: eventLat,
      lng: eventLng,
      trigger_value: 35,
      disruption_hours: 4,
    });

    const insertCall = mockQuery.mock.calls.find(([sql]) =>
      String(sql).includes('INSERT INTO disruption_events')
    );
    expect(insertCall).toBeDefined();
    expect(insertCall?.[1]?.[4]).toBe('extreme');
  });

  test('processTriggerEvent enqueues to claim-creation queue with correct payload', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [{ id: 'worker-1' }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ id: 'event-xyz' }], rowCount: 1 });

    await processTriggerEvent({
      trigger_type: 'heavy_rainfall',
      city: 'Mumbai',
      lat: eventLat,
      lng: eventLng,
      trigger_value: 20,
      disruption_hours: 4,
    });

    expect(mockClaimCreationQueue.add).toHaveBeenCalledWith(
      'create-claims',
      {
        disruption_event_id: 'event-xyz',
        trigger_type: 'heavy_rainfall',
        disruption_hours: 4,
        trigger_value: 20,
        worker_ids: ['worker-1'],
      },
      expect.any(Object)
    );
  });

  test('runTriggerCycle Promise.allSettled - one city failure does not abort others', async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [
          { home_hex_id: eventHexBigintString, city: 'Mumbai' },
          { home_hex_id: eventHexBigintString, city: 'Delhi' },
        ],
        rowCount: 2,
      })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // Delhi duplicate check
      .mockResolvedValueOnce({ rows: [{ id: 'worker-1' }], rowCount: 1 }) // Delhi affected workers
      .mockResolvedValueOnce({ rows: [{ id: 'event-1' }], rowCount: 1 }); // Delhi insert

    let callIndex = 0;
    mockWeatherService.getCurrentConditions.mockImplementation(async () => {
      callIndex += 1;
      if (callIndex === 1) {
        throw new Error('Mumbai weather API failed');
      }
      return {
        weather_multiplier: 1.2,
        rain_1h: 20,
        feels_like: 34,
        temp: 30,
        aqi: null,
      };
    });
    mockWeatherService.getAQI.mockResolvedValue(null);

    await expect(runTriggerCycle()).resolves.toBeUndefined();
    expect(mockClaimCreationQueue.add).toHaveBeenCalledTimes(1);
  });
});
