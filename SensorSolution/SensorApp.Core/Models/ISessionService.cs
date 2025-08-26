namespace SensorApp.Core.Models;

public interface ISessionService
{
  Task<int?> CurrentSessionIdAsync(CancellationToken ct = default);
  Task<int> StartAsync(string? name, CancellationToken ct = default);
  Task StopAsync(CancellationToken ct = default);
  Task AddReadingAsync(double normalized, double? distanceIn, CancellationToken ct = default);
  Task<IReadOnlyList<Session>> GetSessionsAsync(CancellationToken ct = default);
  Task<IReadOnlyList<SensorReading>> GetReadingsAsync(int sessionId, CancellationToken ct = default);
}


