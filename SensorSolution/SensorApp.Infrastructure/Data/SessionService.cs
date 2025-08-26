using SensorApp.Core.Models;

namespace SensorApp.Infrastructure.Data;

public class SessionService : ISessionService
{
  private readonly ISensorRepository _repo;
  private int? _currentSessionId;
  public SessionService(ISensorRepository repo){ _repo = repo; }

  public Task<int?> CurrentSessionIdAsync(CancellationToken ct = default) => Task.FromResult(_currentSessionId);

  public async Task<int> StartAsync(string? name, CancellationToken ct = default)
  {
    _currentSessionId = await _repo.StartSessionAsync(name, DateTime.UtcNow, ct);
    return _currentSessionId.Value;
  }

  public async Task StopAsync(CancellationToken ct = default)
  {
    if (_currentSessionId is null) return;
    await _repo.EndSessionAsync(_currentSessionId.Value, DateTime.UtcNow, ct);
    _currentSessionId = null;
  }

  public async Task AddReadingAsync(double normalized, double? distanceIn, CancellationToken ct = default)
  {
    if (_currentSessionId is null) return;
    await _repo.AddReadingAsync(DateTime.UtcNow, normalized, _currentSessionId, distanceIn, ct);
  }

  public Task<IReadOnlyList<Session>> GetSessionsAsync(CancellationToken ct = default) => _repo.GetSessionsAsync(ct);
  public Task<IReadOnlyList<SensorReading>> GetReadingsAsync(int sessionId, CancellationToken ct = default) => _repo.GetReadingsBySessionAsync(sessionId, ct);
}