using FluentAssertions;
using NSubstitute;
using SensorApp.Core.Entities;
using SensorApp.Core.Interfaces;
using SensorApp.Infrastructure.Data;

namespace SensorApp.UnitTests;

// Tests the orchestration logic inside SessionService (no external I/O).
// We substitute ISensorRepository to verify correct calls and state handling
// without touching InfluxDB or any real storage.
public class SessionServiceTests
{
  private ISensorRepository _repo = null!;
  private SessionService _svc = null!;

  public SessionServiceTests()
  {
    // Use a test double for the repository to isolate the service logic
    _repo = Substitute.For<ISensorRepository>();
    _svc = new SessionService(_repo);
  }

  [Fact]
  public async Task StartAsync_Creates_New_Session_And_Stores_Id()
  {
    // Arrange: starting a session returns id 42
    _repo.StartSessionAsync(Arg.Any<string?>(), Arg.Any<DateTime>(), Arg.Any<CancellationToken>())
        .Returns(Task.FromResult(42));

    // Act
    var id = await _svc.StartAsync("test");

    // Assert: the returned id and in-memory state are set, repo was called
    id.Should().Be(42);
    (await _svc.CurrentSessionIdAsync()).Should().Be(42);
    await _repo.Received(1).StartSessionAsync(Arg.Any<string?>(), Arg.Any<DateTime>(), Arg.Any<CancellationToken>());
  }

  [Fact]
  public async Task StopAsync_Ends_Existing_Session_And_Clears_Id()
  {
    // Arrange: start a session with id 7
    _repo.StartSessionAsync(Arg.Any<string?>(), Arg.Any<DateTime>(), Arg.Any<CancellationToken>())
        .Returns(Task.FromResult(7));
    await _svc.StartAsync("session");

    // Act: stop the session
    await _svc.StopAsync();

    // Assert: repo called with the same id and state cleared
    await _repo.Received(1).EndSessionAsync(7, Arg.Any<DateTime>(), Arg.Any<CancellationToken>());
    (await _svc.CurrentSessionIdAsync()).Should().BeNull();
  }

  [Fact]
  public async Task AddReadingAsync_NoCurrentSession_Does_Not_Write()
  {
    // Act: writing without starting a session
    await _svc.AddReadingAsync(0.5, 10);

    // Assert: no persistence call issued
    await _repo.DidNotReceiveWithAnyArgs().AddReadingAsync(default, default, default, default, default);
  }

  [Fact]
  public async Task AddReadingAsync_WithSession_Writes_To_Repo()
  {
    // Arrange: active session id = 99
    _repo.StartSessionAsync(Arg.Any<string?>(), Arg.Any<DateTime>(), Arg.Any<CancellationToken>())
        .Returns(Task.FromResult(99));
    await _svc.StartAsync("abc");

    // Act: add a reading
    await _svc.AddReadingAsync(0.25, 15.2);

    // Assert: repo receives a write with normalized value and inches distance
    await _repo.Received().AddReadingAsync(Arg.Any<DateTime>(), 0.25, 99, 15.2, Arg.Any<CancellationToken>());
  }
}


