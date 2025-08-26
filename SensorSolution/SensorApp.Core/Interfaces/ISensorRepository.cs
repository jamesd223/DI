using SensorApp.Core.Entities;

namespace SensorApp.Core.Interfaces;

public interface ISensorRepository
{
  Task AddReadingAsync(DateTime timestampUtc, double value, int? sessionId, double? distanceIn = null, CancellationToken ct = default);
  Task<int> StartSessionAsync(string? name, DateTime startedAtUtc, CancellationToken ct = default);
  Task EndSessionAsync(int sessionId, DateTime endedAtUtc, CancellationToken ct = default);

  Task<IReadOnlyList<Session>> GetSessionsAsync(CancellationToken ct = default);
  Task<IReadOnlyList<SensorReading>> GetReadingsBySessionAsync(int sessionId, CancellationToken ct = default);
  Task<IReadOnlyList<SensorReading>> GetRecentReadingsAsync(int take, CancellationToken ct = default);
}


