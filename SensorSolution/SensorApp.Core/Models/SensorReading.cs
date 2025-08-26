namespace SensorApp.Core.Models;
public class SensorReading {
  public int Id { get; set; }
  public DateTime Timestamp { get; set; }
  public double Value { get; set; }
  public int? SessionId { get; set; }
  public Session? Session { get; set; }
}